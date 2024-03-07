// For more information, see https://crawlee.dev/
import { PlaywrightCrawler } from "crawlee";
import fetch from "node-fetch";
import { XHS_COOKIE_KEY } from "./constants/index.js";
import { Page } from "playwright";
import { generateSearchId, showQR } from "./utils/index.js";

const { db, mongoClient } = await import("./utils/mongo.js");
const { redisClient } = await import("./utils/redis.js");

import {
  encrypt_mcr,
  encrypt_encodeUtf8,
  encrypt_b64Encode,
} from "./encrypt/index.js";

const startFetchContent = async (
  page: Page
) => {
  const cookies = await page.context().cookies()
  const cookiesStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '); 
  const cookieDict = cookies.reduce(
    (map, cookie) => {
      return {
        ...map,
        [cookie.name]: cookie.value,
      };
    },
    {} as Record<string, string>
  );

  const url = "/api/sns/web/v1/search/notes";

  const searchId = generateSearchId();

  const data = {
    keyword: "杭州买房",
    page: 1,
    page_size: 20,
    search_id: searchId,
    sort: "general",
    note_type: 0,
  };
  const headers: Record<string, string> = {};
  const encrypt: Record<string, string> = await page.evaluate(([url, data]) => {
    // @ts-ignore
    return window._webmsxyw(url, data);
  }, [url, data]);
  const localStorage: Record<string, string> = await page.evaluate(() => {
    return window.localStorage;
  });

  const Xs = encrypt["X-s"];
  const Xt = encrypt["X-t"];

  headers["X-s"] = Xs;
  headers["X-t"] = Xt;

  const u = Xt || "";
  const s = Xs || "";
  const c = "";
  const l = (u && s) || c;
  const f = localStorage["b1"];
  const p = localStorage["b1b1"] || "1";

  const h = {
    s0: "Mac OS",
    s1: "",
    x0: p,
    x1: "3.6.8",
    x2: "Mac OS",
    x3: "xhs-pc-web",
    x4: "4.5.1",
    x5: cookieDict["a1"],
    x6: u,
    x7: s,
    x8: f,
    x9: encrypt_mcr(u + s + f),
    x10: l,
  };

  headers["X-S-Common"] = encrypt_b64Encode(
    encrypt_encodeUtf8(JSON.stringify(h))
  );

    // debugger
  const res = await fetch("https://edith.xiaohongshu.com/api/sns/web/v1/search/notes", {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "content-type": "application/json;charset=UTF-8",
      "sec-ch-ua":
        '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      ...headers,
      cookie: cookiesStr,
      Referer: "https://www.xiaohongshu.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: JSON.stringify(data),
    method: "POST",
  });
  
  if (res.status === 200) {
    const result = await res.json();
    debugger
  } else {
    return false;
  }
};

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
  headless: false,
  // Use the requestHandler to process each of the crawled pages.
  async requestHandler({ page, log }) {
    await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1920, height: 1000 });

    await page.addInitScript(
      `document.body.appendChild(Object.assign(document.createElement('script'), {src: 'https://gitcdn.xyz/repo/berstend/puppeteer-extra/stealth-js/stealth.min.js'}))`
    );

    try {
      const xhsCookiesString = await redisClient.get(XHS_COOKIE_KEY);
      
      if (xhsCookiesString) {
        const xhsCookie = JSON.parse(xhsCookiesString);

        await page.context().addCookies(xhsCookie);

        await page.reload();

        await page.waitForLoadState("networkidle");

        await page.waitForTimeout(3000);
      }
    } catch (e) {
      log.error(String(e));
    }
    
    const logined = await page.$(".login-container");

    if (logined) {
      const qrcodeImgElement = await page.$(".qrcode-img");
      if (!qrcodeImgElement) return;

      const qrcodeImage = await qrcodeImgElement?.getAttribute("src");
      if (!qrcodeImage) return;

      await showQR(qrcodeImage, page);
      // // // page get cookie
      const cookies = await page.context().cookies();

      await redisClient.set(XHS_COOKIE_KEY, JSON.stringify(cookies));
    }
    
    await startFetchContent(page);
    await mongoClient.close();
    await redisClient.quit();
  },
  // Comment this option to scrape the full website.
  maxRequestsPerCrawl: 1,
  // Uncomment this option to see the browser window.
  // headless: false,
  // retryOnBlocked: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run(["https://www.xiaohongshu.com"]);
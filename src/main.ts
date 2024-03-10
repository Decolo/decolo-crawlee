// For more information, see https://crawlee.dev/
import { Log, PlaywrightCrawler } from "crawlee";
import fetch from "node-fetch";
import { XHS_COOKIE_KEY } from "./constants/index.js";
import { Page } from "playwright";
import {
  delay,
  generateSearchId,
  getHeaders,
  isEmpty,
  showQR,
} from "./utils/index.js";
import { configs } from "../config.js";

const { db, mongoClient } = await import("./utils/mongo.js");
const { redisClient } = await import("./utils/redis.js");

const searchNotes = async (
  page: Page,
  log: Log,
  keyword: string,
  collection: string,
  payload: Record<string, string>
) => {
  if (isEmpty(keyword) || isEmpty(collection)) {
    log.error(`empty keyword or collection`);
    return;
  }

  const cookies = await page.context().cookies();
  const cookiesStr = cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const cookieDict = cookies.reduce((map, cookie) => {
    return {
      ...map,
      [cookie.name]: cookie.value,
    };
  }, {} as Record<string, string>);

  const url = "/api/sns/web/v1/search/notes";

  let currentPage = 1;

  while (true) {
    const searchId = generateSearchId();

    const data = {
      keyword,
      page: currentPage,
      page_size: 20,
      search_id: searchId,
      sort: "general",
      note_type: 0,
    };

    const headers = await getHeaders(page, {
      url,
      data,
      cookieDict,
    });

    try {
      const res = await fetch(
        "https://edith.xiaohongshu.com/api/sns/web/v1/search/notes",
        {
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
        }
      );

      if (res.status === 200) {
        const result = await res.json();

        if (!(result as any)?.data?.has_more) {
          log.info("no more data");
          return;
        }

        const items = (result as any)?.data?.items;

        if (!Array.isArray(items)) {
          log.info("invalid data structure");
          return;
        }

        const dealItems = items
          .filter((item) => item?.id && item?.note_card?.display_title)
          .map((item) => {
            return {
              id: item?.id,
              model_type: item?.model_type,
              display_title: item?.note_card?.display_title,
              interact_info: item?.note_card?.interact_info,
              user: {
                nick_name: item?.note_card?.user?.nick_name,
                user_id: item?.note_card?.user?.user_id,
              },
              keyword,
              payload
            };
          });

        log.info(
          `current page is ${currentPage}, get items count: ${
            dealItems.length
          }, ${new Date()}`
        );

        for (const item of dealItems) {
          await db
            .collection(collection)
            .updateOne(
              { id: item.id },
              { $setOnInsert: item },
              { upsert: true }
            );
        }

        log.info(
          `succeed to insert into ${collection}, ${dealItems.length}
          , ${new Date()}`
        );

        currentPage++;

        await delay(Math.floor(1000 * Math.random() + 1000));
      } else {
        throw res.statusText;
      }
    } catch (e) {
      log.error(String(e));
      break;
    }
  }
};

const startTasks = async (page: Page, log: Log) => {
  if (!Array.isArray(configs)) {
    log.error(`invalid config`);
    return;
  }

  for (const config of configs) {
    const keywords = config?.keywords;
    const collection = config?.collection;
    const payload = config?.payload

    if (!Array.isArray(keywords)) {
      log.error(`empty keywords`);
      return;
    }

    for (const keyword of keywords) {
      log.info(
        `start search "${keyword}", save into ${collection}. ${new Date()}`
      );
      await searchNotes(page, log, keyword, collection, payload);
    }
  }
};

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
  headless: true,
  // Use the requestHandler to process each of the crawled pages.
  async requestHandler({ page, log }) {
    log.info("----");
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
      log.info("cookie is invalid, need to login again.");
      const qrcodeImgElement = await page.$(".qrcode-img");
      if (!qrcodeImgElement) return;

      const qrcodeImage = await qrcodeImgElement?.getAttribute("src");
      if (!qrcodeImage) return;

      log.info("check temp/tmp.jpy");
      await showQR(qrcodeImage, page);
      // // // page get cookie
      const cookies = await page.context().cookies();

      await redisClient.set(XHS_COOKIE_KEY, JSON.stringify(cookies));
    } else {
      log.info("cookie is valid, no need to login again.");
    }

    await startTasks(page, log);
    await mongoClient.close();
    await redisClient.quit();
  },
  // Comment this option to scrape the full website.
  maxRequestsPerCrawl: 100000,
  // Uncomment this option to see the browser window.
  retryOnBlocked: true,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 60 * 60 * 2, // 2h
});

// Add first URL to the queue and start the crawl.
await crawler.run(["https://www.xiaohongshu.com"]);

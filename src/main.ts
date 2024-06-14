// For more information, see https://crawlee.dev/
import { Log, PlaywrightCrawler } from "crawlee";
import fetch from "node-fetch";
import {
  XHS_COOKIE_KEY,
  API_DOMAIN,
  DEFAULT_HEADERS,
} from "./constants/index.js";
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

const fetchNote = async ({
  page,
  id,
  cookiesStr,
  cookieDict,
  log,
}: {
  page: Page;
  id: string;
  cookiesStr: string;
  cookieDict: Record<string, string>;
  log: Log;
}) => {
  const url = "/api/sns/web/v1/feed";

  const data = {
    source_note_id: id,
    image_formats: ["jpg", "webp", "avif"],
    extra: { need_body_topic: "1" },
  };

  const headers = await getHeaders(page, {
    url,
    data,
    cookieDict,
  });

  try {
    const res = await fetch(`${API_DOMAIN}${url}`, {
      headers: {
        ...DEFAULT_HEADERS,
        ...headers,
        cookie: cookiesStr,
      },
      body: JSON.stringify(data),
      method: "POST",
    });

    if (res.status === 200) {
      const result = await res.json();

      if ((result as any)?.code) {
        log.error((result as any)?.msg);
        return;
      }

      if (!result || !(result as any)?.data) {
        log.error("invalid response");
        return null;
      }

      const detailItems = (result as any)?.data?.items;
      if (!Array.isArray(detailItems)) {
        log.error("invalid response structure");
        return null;
      }

      return detailItems
        .filter((item) => item?.id)
        .map((item) => {
          const { at_user_list, share_info, ...rest } = item.note_card;
          return {
            id: item.id,
            model_type: item.model_type,
            ...rest,
          };
        });
    } else {
      throw res.statusText;
    }

  } catch (e) {
    log.error("** fetch note error **" + String(e));
    return null;
  }
};

const searchNotes = async ({
  page,
  log,
  keyword,
  collection,
  payload,
}: {
  page: Page;
  log: Log;
  keyword: string;
  collection: string;
  payload?: Record<string, string>;
}) => {
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
      const res = await fetch(`${API_DOMAIN}${url}`, {
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
          cookie: cookiesStr,
        },
        body: JSON.stringify(data),
        method: "POST",
      });

      if (res.status === 200) {
        const result = await res.json();
        
        if ((result as any)?.code) {
          log.error((result as any)?.msg);
          return;
        }

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
              ...(payload || {}),
            };
          });

        log.info(
          `current page is ${currentPage}, get items count: ${
            dealItems.length
          }, ${new Date()}`
        );

        for (const item of dealItems) {
          await delay(Math.floor(500 * Math.random()) + 100);

          const noteDetails = await fetchNote({
            page,
            id: item.id,
            cookiesStr,
            cookieDict,
            log,
          });

          await db.collection(collection).updateOne(
            { id: item.id },
            {
              $setOnInsert: {
                ...item,
                node_details: noteDetails,
              },
            },
            { upsert: true }
          );
        }

        log.info(
          `succeed to insert into ${collection}, ${dealItems.length}
          , ${new Date()}`
        );

        currentPage++;

        await delay(Math.floor(600 * Math.random() + 400));
      } else {
        throw res.statusText;
      }
    } catch (e) {
      log.error("** searchNotes error **" + String(e));
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
    const payload = config?.payload;

    if (!Array.isArray(keywords)) {
      log.error(`empty keywords`);
      return;
    }

    for (const keyword of keywords) {
      log.info(
        `start search "${keyword}", save into ${collection}. ${new Date()}`
      );
      await searchNotes({
        page,
        log,
        keyword,
        collection,
        payload,
      });
    }
  }
};

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
  // headless: true,
  headless: false,
  // Use the requestHandler to process each of the crawled pages.
  async requestHandler({ page, log }) {
    log.info("----");
    // await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1920, height: 1000 });

    // await page.addInitScript(
    //   `document.body.appendChild(Object.assign(document.createElement('script'), {src: 'https://gitcdn.xyz/repo/berstend/puppeteer-extra/stealth-js/stealth.min.js'}))`
    // );

    try {
      const xhsCookiesString = await redisClient.get(XHS_COOKIE_KEY);

      if (xhsCookiesString) {
        const xhsCookie = JSON.parse(xhsCookiesString);
        debugger

        await page.context().addCookies(xhsCookie);

        await page.reload();

        // await page.waitForLoadState("networkidle");

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

    const searchInput = await page.$("#search-input");

    if (searchInput) {
      await searchInput?.fill("搭子");
      
      const searchBtn = await page.$(".search-icon");
      
      if (searchBtn) {
        await searchBtn.click();
      }
    }
    
    await page.waitForTimeout(5000);
    
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      debugger
      await page.waitForTimeout(2000);
    }
    debugger
    // await page.evaluate(() => {
    //   window.scrollTo(0, document.body.scrollHeight / 2);
    // })
    // debugger
    // await startTasks(page, log);
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

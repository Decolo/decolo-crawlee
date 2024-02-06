// For more information, see https://crawlee.dev/
import { PlaywrightCrawler, log } from "crawlee";

import { getAccessCode } from "./utils/question.js";
import { DOMAIN, XHS_COOKIE_KEY } from "./constants/index.js";
import { Page } from "playwright";

const { db, mongoClient } = await import("./utils/mongo.js");
const { redisClient } = await import("./utils/redis.js");

let lastIndex = 0;
const getContentAndInsertDB = async (page: Page) => {
  const data = await page.$$eval("a.title", ($posts) => {
    const scrapedData: { title: string; pathname: string }[] = [];

    $posts.forEach(($post) => {
      const pathname = $post.getAttribute("href");
      const title = $post.querySelector("span")?.innerHTML || $post.innerHTML;

      if (!pathname) return;

      scrapedData.push({
        title,
        pathname: pathname,
      });
    });

    return scrapedData;
  });
  
  const items = data.slice(lastIndex);

  lastIndex = data.length;

  const contents = db.collection("contents");

  const itemsToInsert = [];

  for (const item of items) {
    // 检查当前的 'href' 是否已经存在于集合中
    const existingDocument = await contents.findOne({
      href: `${DOMAIN}${item.pathname}`,
    });

    // 如果 'href' 不在集合中，那么添加这个数据到筛选后的数据列表
    if (!existingDocument) {
      itemsToInsert.push({
        title: item.title,
        href: `${DOMAIN}${item.pathname}`,
      });
    }
  }
  debugger;

  if (!itemsToInsert.length) return;

  try {
    await contents.insertMany(
      itemsToInsert,
      { ordered: true }
    );
  } catch (e) {
    log.error(`Insert data error: ${e}`);
  }
};

const startFetchContent = async (page: Page) => {
  await getContentAndInsertDB(page);

  let _lastIndex = 0;
  while (_lastIndex !== lastIndex) {
    _lastIndex = lastIndex;

    await page.evaluate(() => {
      debugger
      window.scrollTo(0, document.body.scrollHeight);
    });
    debugger
    
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(10000);
    debugger;

    await getContentAndInsertDB(page);
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
      console.error(e);
    }
    debugger;
    const phone = await page.$(".phone");

    if (phone) {
      await page.getByPlaceholder("输入手机号").fill("13033602037");

      await page
        .getByText("获取验证码", {
          exact: true,
        })
        .click();

      const agree = await page.$(".agree-icon");
      await agree?.click();

      const accessCode = await getAccessCode();

      if (!accessCode) {
        log.error("Please input your access code!");
        return;
      }
      await page.getByPlaceholder("输入验证码").fill(accessCode);

      const signin = await page.$(".submit");
      await signin?.click();
      await page.waitForLoadState("networkidle");

      await page.waitForTimeout(5000);

      // // page get cookie
      const cookies = await page.context().cookies();

      debugger;

      await redisClient.set(XHS_COOKIE_KEY, JSON.stringify(cookies));
    }

    await startFetchContent(page);
    debugger
    await mongoClient.close();
    await redisClient.quit();
  },
  // Comment this option to scrape the full website.
  maxRequestsPerCrawl: 1,
  // Uncomment this option to see the browser window.
  // headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run([
  "https://www.xiaohongshu.com/search_result/?keyword=%25E6%2583%2585%25E8%25B6%25A3&source=web_search_result_notes&type=51",
]);

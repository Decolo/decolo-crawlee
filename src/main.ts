// For more information, see https://crawlee.dev/
import { PlaywrightCrawler } from "crawlee";

import { getAccessCode } from "./utils/question.js";

const { db, mongoClient } = await import("./utils/mongo.js");
const { redisClient } = await import("./utils/redis.js");

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
  headless: false,
  // Use the requestHandler to process each of the crawled pages.
  async requestHandler({ page, log }) {
    await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1920, height: 1000 });

    try {
      const xhsCookiesString = await redisClient.get("xhs-cookies");

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

      await page.waitForTimeout(10000);

      // // page get cookie
      const cookies = await page.context().cookies();

      debugger;

      await redisClient.set("xhs-cookies", JSON.stringify(cookies));
    }

    debugger;
    const data = await page.$$eval("a.title", ($posts) => {
      const scrapedData: { title: string; href: string }[] = [];

      $posts.forEach(($post) => {
        scrapedData.push({
          title: $post.innerHTML,
          href: $post.getAttribute("href") || "",
        });
      });

      return scrapedData;
    });

    const titles = db.collection("titles");

    try {
      await titles.insertMany(data, { ordered: true });
    } catch (e) {
      console.error(e);
    } finally {
      await mongoClient.close();
      await redisClient.quit();
    }
  },
  // Comment this option to scrape the full website.
  maxRequestsPerCrawl: 2,
  // Uncomment this option to see the browser window.
  // headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run([
  "https://www.xiaohongshu.com/search_result/?keyword=%25E6%2583%2585%25E8%25B6%25A3&source=web_search_result_notes&type=51",
]);

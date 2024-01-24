// For more information, see https://crawlee.dev/
import { PlaywrightCrawler } from "crawlee";
import { getAccessCode } from "./utils/question.js";

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
  headless: false,
  // Use the requestHandler to process each of the crawled pages.
  async requestHandler({ request, page, enqueueLinks, log, pushData }) {
    await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1920, height: 1000 });

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
    debugger
    const signin = await page.$(".submit");
    await signin?.click();
    await page.waitForLoadState("networkidle");

    await page.waitForTimeout(10000);

    await page.screenshot({ path: `./example.png` });

    
    const data = await page.$$eval("a.title", ($posts) => {
        const scrapedData: { title: string; href: string }[] = [];

        $posts.forEach(($post) => {
            scrapedData.push({
                title: $post.innerHTML,
                href: $post.getAttribute("href") || "",
            });
        });

        return scrapedData;
    })

    debugger
    await pushData(data);
    
    // debugger;
    // // await page.(".phone>input", "13033602037", { delay: 200 });
    // const title = await page.title();
    // log.info(`Title of ${request.loadedUrl} is '${title}'`);

    // // Save results as JSON to ./storage/datasets/default
    

    // // Extract links from the current page
    // // and add them to the crawling queue.
    // await enqueueLinks();
  },
  // Comment this option to scrape the full website.
  // maxRequestsPerCrawl: 20,
  // Uncomment this option to see the browser window.
  // headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run([
  "https://www.xiaohongshu.com/search_result/?keyword=%25E6%2583%2585%25E8%25B6%25A3&source=web_search_result_notes&type=51",
]);

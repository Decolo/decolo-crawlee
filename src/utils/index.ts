import fs from "fs";
import path from "path";
import { Page } from "playwright";
import {
  encrypt_mcr,
  encrypt_encodeUtf8,
  encrypt_b64Encode,
} from "../encrypt/index.js";

const base36encode = (
  number: number,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
) => {
  if (typeof number !== "number" || !Number.isInteger(number)) {
    throw new TypeError("number must be an integer");
  }

  let base36 = "";
  let sign = "";

  if (number < 0) {
    sign = "-";
    number = -number;
  }

  if (0 <= number && number < alphabet.length) {
    return sign + alphabet.charAt(number);
  }

  while (number != 0) {
    let i = number % alphabet.length; // equivalent to `divmod` in Python
    number = Math.floor(number / alphabet.length);
    base36 = alphabet.charAt(i) + base36;
  }

  return sign + base36;
};

export const generateSearchId = () => {
  const e = BigInt(Math.floor(Date.now())) << BigInt(64);
  const t = Math.floor(Math.random() * 2147483646);
  return base36encode(Number(e) + t);
};

const loopCheckQR = async (page: Page) => {
  const check = async () => {
    const ele = await page.$(".qrcode-img");

    return !ele;
  };

  return new Promise((resolve) => {
    setInterval(async () => {
      if (await check()) {
        resolve(true);
      }
    }, 1000);
  });
};

export const showQR = async (base64: string, page: Page) => {
  const base64buffer = Buffer.from(base64.split(",")[1], "base64");

  fs.writeFileSync(getCWDreltivePath("./temp/tmp.jpg"), base64buffer);
  debugger

  await loopCheckQR(page);

  fs.unlinkSync("./temp");
};

export const getHeaders = async (
  page: Page,
  {
    url,
    data,
    cookieDict,
  }: {
    url: string;
    data: Record<string, number | string>;
    cookieDict: Record<string, string>;
  }
) => {
  const headers: Record<string, string> = {};

  const encrypt: Record<string, string> = await page.evaluate(
    ([url, data]) => {
      // @ts-ignore
      return window._webmsxyw(url, data);
    },
    [url, data]
  );

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

  return headers;
};

export const getCWDreltivePath = (_path: string) => {
  return path.resolve(process.cwd(), _path);
};

export const delay = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

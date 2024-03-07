import fs from "fs";
import { Page } from "playwright";

function base36encode(number: number, alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  if (typeof number !== 'number' || !Number.isInteger(number)) {
      throw new TypeError('number must be an integer');
  }

  let base36 = '';
  let sign = '';

  if (number < 0) {
      sign = '-';
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
}

export const generateSearchId = () => {
  const e = BigInt(Math.floor(Date.now())) << BigInt(64);
  const t = Math.floor(Math.random() * 2147483646);
  return base36encode((Number(e) + t));
};

const loopCheck = async (page: Page) => {

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

  fs.writeFileSync("tmp.jpg", base64buffer);

  await loopCheck(page);

  fs.unlinkSync("tmp.jpg");
};

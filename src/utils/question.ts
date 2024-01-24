import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const getAccessCode = (): Promise<string> => {
  return new Promise((resolve,) => {
    rl.question("Input your access code:", (code) => {
      console.log(`Done，${code}!`);
      rl.close();
      resolve(code);
    });
  });
};
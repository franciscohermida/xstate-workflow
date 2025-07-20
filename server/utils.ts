export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepDev(ms: number) {
  if (process.env.MODE === "development") {
    return sleep(ms);
  }

  return Promise.resolve();
}

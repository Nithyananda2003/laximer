import puppeteer from "puppeteer";

let instance = null;

const getBrowserInstance = async () => {
    if (!instance) {
        instance = await puppeteer.launch({
            headless: true,
            args: [
                "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                '--lang="en-US"'
            ]
        });
        console.log("Puppeteer instance launched");
    }
    return instance;
};

export default getBrowserInstance;

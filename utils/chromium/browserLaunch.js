import puppeteer from "puppeteer";

let instance = null;
const getBrowserInstance = async () => {
    if (!instance) {
        instance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--lang=en-US'
            ]
        });
        console.log("Browser instance started");
    }
    return instance;
};

export default getBrowserInstance;

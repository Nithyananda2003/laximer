// Author: Nithyananda R S - Larimer County Tax Controller
import getBrowserInstance from "../utils/chromium/browserLaunch.js";

// Universal delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const getCurrentTaxYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
};

// Main data extraction function
const lc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto("https://www.larimer.gov/treasurer/search", { waitUntil: "networkidle2", timeout: 60000 });
            await delay(2000);

            // Parcel input
            await page.waitForSelector('#parcelno', { timeout: 10000 });
            const parcelInput = await page.$('#parcelno');
            await parcelInput.click({ clickCount: 3 });
            await parcelInput.type(account, { delay: 100 });

            // Click Find Property
            await page.waitForSelector('input[value="Find Property"]', { timeout: 10000 });
            const findPropertyButton = await page.$('input[value="Find Property"]');
            await findPropertyButton.click();

            // Wait for results and click first row
            await page.waitForSelector('#resultsTable tbody tr', { timeout: 15000 });
            await delay(2000);
            const firstResultRow = await page.$('#resultsTable tbody tr:first-child');
            await firstResultRow.click();

            // Wait for property details
            await page.waitForSelector('.col-sm-6', { timeout: 15000 });
            await delay(2000);

            // Extract data
            const pageData = await page.evaluate(() => {
                const addOneDay = (dateStr) => {
                    try {
                        const d = new Date(dateStr);
                        d.setDate(d.getDate() + 1);
                        return d.toLocaleDateString("en-US");
                    } catch {
                        return "";
                    }
                };

                const data = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "Larimer County Treasurer, 200 W Oak St, Fort Collins, CO 80521",
                    notes: "",
                    delinquent: "",
                    tax_history: []
                };

                // Property info
                const propertyRows = document.querySelectorAll(".col-sm-6:first-child table tbody tr");
                propertyRows.forEach((row) => {
                    const label = row.querySelector("td:first-child")?.innerText.trim();
                    const value = row.querySelector("td:last-child")?.innerText.trim();
                    if (!label) return;

                    if (label.includes("Owner Name")) data.owner_name[0] = value || "N/A";
                    if (label.includes("Property Address")) data.property_address = value || "N/A";
                    if (label.includes("Parcel Number")) data.parcel_number = value || "N/A";
                    if (label.includes("Land")) data.land_value = value || "N/A";
                    if (label.includes("Improvements")) data.improvements = value || "N/A";
                    if (label.includes("Total Assessed Value")) data.total_assessed_value = value || "N/A";
                    if (label.includes("Exemption")) data.exemption = value || "N/A";
                    if (label.includes("Total Taxable Value")) data.total_taxable_value = value || "N/A";
                });

                // Payment info
                const paymentRows = document.querySelectorAll(".col-sm-6:nth-child(2) table tbody tr");
                let paidDates = [];
                let fullRow = null, firstRow = null, secondRow = null, propertyBalance = "$0.00";

                paymentRows.forEach((row) => {
                    const label = row.querySelector("td:first-child")?.innerText.trim();

                    if (label && label.includes("Payment Received Date")) {
                        paidDates = Array.from(row.querySelectorAll("span.ng-binding")).map(el => el.innerText.trim());
                    }

                    const cols = row.querySelectorAll("td");
                    if (cols.length === 3) {
                        const period = cols[0]?.innerText.trim();
                        const due_date = cols[1]?.innerText.trim();
                        const base_amount = cols[2]?.innerText.trim();

                        if (period.includes("Full Amount")) fullRow = { period, due_date, base_amount };
                        if (period.includes("First Half")) firstRow = { period, due_date, base_amount };
                        if (period.includes("Second Half")) secondRow = { period, due_date, base_amount };
                        if (period.includes("Property Balance")) propertyBalance = base_amount;
                    }
                });

                const currentYear = new Date().getFullYear().toString();
                const balanceAmount = parseFloat(propertyBalance.replace(/[^0-9.-]+/g, "")) || 0;

                if (balanceAmount > 0) {
                    // Unpaid logic
                    if (fullRow && (!firstRow || !secondRow || parseFloat(firstRow?.base_amount?.replace(/[^0-9.-]+/g, "") || "0") === 0)) {
                        data.tax_history.push({
                            jurisdiction: "County",
                            year: currentYear,
                            payment_type: "Annual",
                            status: "Unpaid",
                            base_amount: fullRow.base_amount,
                            amount_paid: "$0.00",
                            amount_due: fullRow.base_amount,
                            mailing_date: "N/A",
                            due_date: fullRow.due_date,
                            delq_date: addOneDay(fullRow.due_date),
                            paid_date: "",
                            good_through_date: "",
                        });
                        data.notes = "ALL PRIORS ARE PAID, CURRENT YEAR TAXES ARE NOT PAID, NORMALLY TAXES ARE PAID ANNUALLY";
                        data.delinquent = "YES";
                    } else if (firstRow && secondRow) {
                        const firstAmount = parseFloat(firstRow.base_amount.replace(/[^0-9.-]+/g, "")) || 0;
                        const secondAmount = parseFloat(secondRow.base_amount.replace(/[^0-9.-]+/g, "")) || 0;

                        if (firstAmount > 0) {
                            const isFirstPaid = paidDates.length > 0;
                            data.tax_history.push({
                                jurisdiction: "County",
                                year: currentYear,
                                payment_type: "Semi-Annual",
                                status: isFirstPaid ? "Paid" : "Unpaid",
                                base_amount: firstRow.base_amount,
                                amount_paid: isFirstPaid ? firstRow.base_amount : "$0.00",
                                amount_due: isFirstPaid ? "$0.00" : firstRow.base_amount,
                                mailing_date: "N/A",
                                due_date: firstRow.due_date,
                                delq_date: addOneDay(firstRow.due_date),
                                paid_date: isFirstPaid && paidDates[0] ? paidDates[0] : "",
                                good_through_date: "",
                            });
                        }

                        if (secondAmount > 0) {
                            const isSecondPaid = paidDates.length > 1;
                            data.tax_history.push({
                                jurisdiction: "County",
                                year: currentYear,
                                payment_type: "Semi-Annual",
                                status: isSecondPaid ? "Paid" : "Unpaid",
                                base_amount: secondRow.base_amount,
                                amount_paid: isSecondPaid ? secondRow.base_amount : "$0.00",
                                amount_due: isSecondPaid ? "$0.00" : secondRow.base_amount,
                                mailing_date: "N/A",
                                due_date: secondRow.due_date,
                                delq_date: addOneDay(secondRow.due_date),
                                paid_date: isSecondPaid && paidDates[1] ? paidDates[1] : "",
                                good_through_date: "",
                            });
                        }

                        const hasUnpaid = data.tax_history.some(e => e.status === "Unpaid");
                        const hasPaid = data.tax_history.some(e => e.status === "Paid");
                        data.notes = hasUnpaid && hasPaid
                            ? "ALL PRIORS ARE PAID, CURRENT YEAR PARTIALLY PAID, BALANCE DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY"
                            : "ALL PRIORS ARE PAID, CURRENT YEAR TAXES ARE NOT PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY";
                        data.delinquent = "YES";
                    }
                } else {
                    // Paid logic
                    if (paidDates.length === 1 && fullRow) {
                        data.tax_history.push({
                            jurisdiction: "County",
                            year: currentYear,
                            payment_type: "Annual",
                            status: "Paid",
                            base_amount: fullRow.base_amount,
                            amount_paid: fullRow.base_amount,
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: fullRow.due_date,
                            delq_date: addOneDay(fullRow.due_date),
                            paid_date: paidDates[0],
                            good_through_date: "",
                        });
                        data.notes = "ALL PRIORS ARE PAID, CURRENT YEAR TAXES ARE PAID, NORMALLY TAXES ARE PAID ANNUALLY";
                        data.delinquent = "NONE";
                    } else if (paidDates.length === 2 && firstRow && secondRow) {
                        data.tax_history.push({
                            jurisdiction: "County",
                            year: currentYear,
                            payment_type: "Semi-Annual",
                            status: "Paid",
                            base_amount: firstRow.base_amount,
                            amount_paid: firstRow.base_amount,
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: firstRow.due_date,
                            delq_date: addOneDay(firstRow.due_date),
                            paid_date: paidDates[0],
                            good_through_date: "",
                        });

                        data.tax_history.push({
                            jurisdiction: "County",
                            year: currentYear,
                            payment_type: "Semi-Annual",
                            status: "Paid",
                            base_amount: secondRow.base_amount,
                            amount_paid: secondRow.base_amount,
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: secondRow.due_date,
                            delq_date: addOneDay(secondRow.due_date),
                            paid_date: paidDates[1],
                            good_through_date: "",
                        });

                        data.notes = "ALL PRIORS ARE PAID, CURRENT YEAR TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY";
                        data.delinquent = "NONE";
                    }
                }

                return data;
            });

            pageData.parcel_number = account;
            resolve(pageData);

        } catch (error) {
            reject(new Error(error.message));
        }
    });
};

// Main search function
const search = async (req, res) => {
    const { fetch_type, account } = req.body;

    try {
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(400).json({ error: true, message: "Invalid fetch_type. Must be 'html' or 'api'" });
        }

        if (!account) {
            const errorMsg = "Parcel number is required";
            if (fetch_type === "html") {
                return res.status(200).render('error_data', { error: true, message: errorMsg });
            } else {
                return res.status(400).json({ error: true, message: errorMsg });
            }
        }

        const browser = await getBrowserInstance();
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['stylesheet','font','image'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type === "html") {
            lc_1(page, account)
                .then((data) => res.status(200).render("parcel_data_official", data))
                .catch((error) => res.status(200).render('error_data', { error: true, message: error.message }))
                .finally(async () => await page.close());
        } else if (fetch_type === "api") {
            lc_1(page, account)
                .then((data) => res.status(200).json({ result: data }))
                .catch((error) => res.status(500).json({ error: true, message: error.message }))
                .finally(async () => await page.close());
        }

    } catch (error) {
        if (fetch_type === "html") {
            res.status(200).render('error_data', { error: true, message: error.message });
        } else {
            res.status(500).json({ error: true, message: error.message });
        }
    }
};

export { search };

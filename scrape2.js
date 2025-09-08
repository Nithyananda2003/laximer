import puppeteer from "puppeteer";

const URL =
  "https://www.larimer.gov/treasurer/search#/search/?parcelNumber=8718200092&yr=2024&PID=5&SN=116&taxyear=2024";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  await page.waitForSelector(".col-sm-6 h3", { timeout: 60000 });

  // ---------------- Paid Taxes ----------------
  async function getPaidTaxes(page) {
    return await page.evaluate(() => {
      const addOneDay = (dateStr) => {
        try {
          const d = new Date(dateStr);
          d.setDate(d.getDate() + 1);
          return d.toLocaleDateString("en-US");
        } catch {
          return "";
        }
      };

      const data = { tax_history: [] };

      let paidDates = [];
      document
        .querySelectorAll(".col-sm-6:nth-child(2) table tbody tr")
        .forEach((row) => {
          const label = row.querySelector("td:first-child")?.innerText.trim();
          if (label && label.includes("Payment Received Date")) {
            paidDates = Array.from(row.querySelectorAll("span.ng-binding")).map(
              (el) => el.innerText.trim()
            );
          }
        });

      // Payment rows
      const paymentRows = Array.from(
        document.querySelectorAll(".col-sm-6:nth-child(2) table tbody tr")
      ).filter((row) => row.querySelectorAll("td").length === 3);

      let usedPaidDates = [...paidDates];

      paymentRows.forEach((row) => {
        const [periodCell, dueDateCell, amountCell] = row.querySelectorAll("td");
        const period = periodCell.innerText.trim();
        const due_date = dueDateCell.innerText.trim();
        const base_amount = amountCell.innerText.trim();

        const paid_date = usedPaidDates.shift();
        if (paid_date) {
          const payment_type = period.includes("Half") ? "Semi Annual" : "Annual";

          data.tax_history.push({
            jurisdiction: "County",
            year: due_date.split("/")[2] || "Unknown",
            payment_type,
            status: "Paid",
            base_amount,
            amount_paid: base_amount,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date,
            delq_date: addOneDay(due_date),
            paid_date,
            good_through_date: "",
          });
        }
      });

      return data;
    });
  }

  // ---------------- Unpaid Taxes ----------------
  async function getUnpaidTaxes(page, paidData) {
    return await page.evaluate((paidData) => {
      const addOneDay = (dateStr) => {
        try {
          const d = new Date(dateStr);
          d.setDate(d.getDate() + 1);
          return d.toLocaleDateString("en-US");
        } catch {
          return "";
        }
      };

      const data = { tax_history: [], delinquent: "NO", notes: "" };

      const paymentRows = Array.from(
        document.querySelectorAll(".col-sm-6:nth-child(2) table tbody tr")
      ).filter((row) => row.querySelectorAll("td").length === 3);

      let anyUnpaid = false;

      paymentRows.forEach((row) => {
        const [periodCell, dueDateCell, amountCell] = row.querySelectorAll("td");
        const period = periodCell.innerText.trim();
        const due_date = dueDateCell.innerText.trim();
        const base_amount = amountCell.innerText.trim();
        const year = due_date.split("/")[2] || "Unknown";

        const alreadyPaid = paidData.tax_history.some(
          (t) => t.due_date === due_date && t.status === "Paid"
        );

        if (!alreadyPaid) {
          anyUnpaid = true;
          const payment_type = period.includes("Half") ? "Semi Annual" : "Annual";

          data.tax_history.push({
            jurisdiction: "County",
            year,
            payment_type,
            status: "Unpaid",
            base_amount,
            amount_paid: "$0.00",
            amount_due: base_amount,
            mailing_date: "N/A",
            due_date,
            delq_date: addOneDay(due_date),
            paid_date: "",
            good_through_date: "",
          });
        }
      });

      if (anyUnpaid) {
        data.delinquent = "YES";
        data.notes =
          "PRIOR YEAR(S) TAXES ARE DUE, CURRENT TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY OR SEMI-ANNUALLY, NORMAL DUE DATES APPLY.";
      }

      return data;
    }, paidData);
  }

  // ---------------- Run ----------------
  const paidData = await getPaidTaxes(page);
  const unpaidData = await getUnpaidTaxes(page, paidData);

  const finalData = {
    ...paidData,
    tax_history: [...paidData.tax_history, ...unpaidData.tax_history],
    delinquent: unpaidData.delinquent,
    notes: unpaidData.notes,
  };

  console.log(JSON.stringify(finalData, null, 2));

  await browser.close();
})();

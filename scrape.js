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

  const result = await page.evaluate(() => {
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
      processed_date: new Date().toLocaleDateString("en-US"),
      order_number: "",
      borrower_name: "",
      owner_name: "",
      property_address: "",
      parcel_number: "",
      land_value: "",
      improvements: "",
      total_assessed_value: "",
      exemption: "",
      total_taxable_value: "",
      tax_history: [],
    };

    // ---------- Property Info ----------
    const propertyRows = document.querySelectorAll(
      ".col-sm-6:first-child table tbody tr"
    );
    propertyRows.forEach((row) => {
      const label = row.querySelector("td:first-child")?.innerText.trim();
      const value = row.querySelector("td:last-child")?.innerText.trim();
      if (!label) return;

      if (label.includes("Owner Name")) data.owner_name = value;
      if (label.includes("Property Address")) data.property_address = value;
      if (label.includes("Parcel Number")) data.parcel_number = value;
      if (label.includes("Land")) data.land_value = value;
      if (label.includes("Improvements")) data.improvements = value;
      if (label.includes("Total Assessed Value"))
        data.total_assessed_value = value;
      if (label.includes("Exemption")) data.exemption = value;
      if (label.includes("Total Taxable Value"))
        data.total_taxable_value = value;
    });

    // ---------- Paid Dates ----------
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

    // ---------- Payment Rows ----------
    const paymentRows = document.querySelectorAll(
      ".col-sm-6:nth-child(2) table tbody tr"
    );

    let fullRow = null,
      firstRow = null,
      secondRow = null;

    paymentRows.forEach((row) => {
      const cols = row.querySelectorAll("td");
      if (cols.length === 3) {
        const period = cols[0]?.innerText.trim();
        const due_date = cols[1]?.innerText.trim();
        const base_amount = cols[2]?.innerText.trim();

        if (period.includes("Full Amount"))
          fullRow = { period, due_date, base_amount };
        if (period.includes("First Half"))
          firstRow = { period, due_date, base_amount };
        if (period.includes("Second Half"))
          secondRow = { period, due_date, base_amount };
      }
    });

    // ---------- Logic: Annual vs Semi-Annual ----------
    if (paidDates.length === 1 && fullRow) {
      // Annual Payment
      data.tax_history.push({
        jurisdiction: "County",
        year: "2024",
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
    } else if (paidDates.length === 2 && firstRow && secondRow) {
      // Semi Annual Payment
      data.tax_history.push({
        jurisdiction: "County",
        year: "2024",
        payment_type: "Semi Annual",
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
        year: "2024",
        payment_type: "Semi Annual",
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
    }

    return data;
  });

  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();

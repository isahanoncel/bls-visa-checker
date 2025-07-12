const { Builder, Browser, By, Key, until } = require("selenium-webdriver");
const { solveCaptchaInIframe } = require("./captchaSolver");
const { sendMessageToTelegram } = require("./telegramNotifier");

require("dotenv").config();

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function main() {
  async function selectFirstVisibleKendoDropdown(
    driver,
    idList,
    visibleText,
    timeout = 10000
  ) {
    const targetText = visibleText.trim().toLowerCase();
    for (const id of idList) {
      try {
        const input = await driver.findElement(By.css(`#${id}`));
        const parent = await input.findElement(By.xpath(".."));
        const isDisplayed = await parent.isDisplayed();
        if (!isDisplayed) continue;

        const dropdownWrap = await parent.findElement(
          By.css("span.k-dropdown-wrap")
        );
        await dropdownWrap.click();
        await driver.sleep(500);

        let found = false;
        let optionsLoaded = false;
        let start = Date.now();
        while (Date.now() - start < timeout) {
          const allLists = await driver.findElements(
            By.css(".k-list-container ul, .k-animation-container ul")
          );
          for (const ul of allLists) {
            const items = await ul.findElements(By.css("li.k-item"));
            if (items.length > 0) {
              optionsLoaded = true;
              for (const item of items) {
                const txt = (await item.getText()).trim();
                console.log("Dropdown item:", txt);
                if (
                  txt.toLowerCase() === targetText ||
                  txt.toLowerCase().includes(targetText)
                ) {
                  await driver.executeScript(
                    'arguments[0].scrollIntoView({block: "center"});',
                    item
                  );
                  await driver.sleep(500);
                  try {
                    await driver.wait(until.elementIsVisible(item), 2000);
                    await driver.wait(until.elementIsEnabled(item), 2000);
                    await item.click();
                  } catch (e) {
                    await driver.sleep(500);
                    await driver.executeScript("arguments[0].click();", item);
                  }
                  console.log(
                    `For (${id}) '${visibleText}' selected!`
                  );
                  await driver.sleep(500);
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
          }
          if (found) break;
          await driver.sleep(400);
        }
        if (!optionsLoaded) {
          console.log(`Dropdown (${id}) options never appeared in DOM!`);
          continue;
        }
        if (found) return true;
        else
          console.log(
            `Dropdown (${id}) '${visibleText}' not found in DOM!`
          );
      } catch (e) {
        console.log(`Error for dropdown (${id}):`, e.message);
      }
    }
    console.log(
      `Dropdowns (${idList.join(", ")}) '${visibleText}' not found!`
    );
    return false;
  }

  (async function example() {
    const chromeOptions = new (require("selenium-webdriver/chrome").Options)();
    chromeOptions.addArguments("--start-maximized");
    let driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(chromeOptions).build();
    try {
      await driver.get(
        "https://turkey.blsspainglobal.com/Global/Account/LogIn"
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Wait for any real input fields to be visible and interactable
      await driver.wait(
        until.elementLocated(By.css('input[type="text"], input[type="email"]')),
        10000
      );
      await driver.wait(
        until.elementLocated(By.css('input[type="password"]')),
        10000
      );

      const textInputs = await driver.findElements(
        By.css('input[type="text"], input[type="email"]')
      );
      const passwordInputs = await driver.findElements(
        By.css('input[type="password"]')
      );

      console.log(
        `Found ${textInputs.length} text inputs and ${passwordInputs.length} password inputs`
      );

      let realUsernameInput = null;
      let realPasswordInput = null;

      for (let input of textInputs) {
        try {
          const isDisplayed = await input.isDisplayed();
          const isEnabled = await input.isEnabled();
          const rect = await input.getRect();

          if (isDisplayed && isEnabled && rect.width > 0 && rect.height > 0) {
            console.log(
              "Found visible username input:",
              await input.getAttribute("id")
            );
            realUsernameInput = input;
            break;
          }
        } catch (e) {
          console.log("Error checking input:", e.message);
        }
      }

      for (let input of passwordInputs) {
        try {
          const isDisplayed = await input.isDisplayed();
          const isEnabled = await input.isEnabled();
          const rect = await input.getRect();

          if (isDisplayed && isEnabled && rect.width > 0 && rect.height > 0) {
            console.log(
              "Found visible password input:",
              await input.getAttribute("id")
            );
            realPasswordInput = input;
            break;
          }
        } catch (e) {
          console.log("Error checking input:", e.message);
        }
      }

      if (realUsernameInput && realPasswordInput) {
        await realUsernameInput.clear();
        await realUsernameInput.sendKeys(EMAIL);

        await realPasswordInput.clear();
        await realPasswordInput.sendKeys(PASSWORD);

        console.log("Successfully filled in credentials");
      } else {
        console.log("Could not find real input fields");

        try {
          await driver.findElement(By.id("UserId6")).sendKeys(EMAIL);
          await driver.findElement(By.id("Password5")).sendKeys(PASSWORD);
          console.log("Used fallback IDs");
        } catch (e) {
          console.log("Fallback also failed:", e.message);
        }
      }

      await driver.findElement(By.id("btnVerify")).click();

      await driver.sleep(3000);

      await solveCaptchaInIframe(driver);

      await driver.wait(until.urlContains("/Global/home/index"), 2000);

      await driver.sleep(5000);

      try {
        const bookNewAppLink = await driver.findElement(
          By.css(
            'a.nav-link.new-app-active[href="/Global/bls/visatypeverification"]'
          )
        );
        await bookNewAppLink.click();
        console.log("Book New Appointment linkine tÄ±klandÄ±.");
      } catch (e) {
        console.log("Book New Appointment linkine tÄ±klanamadÄ±:", e.message);
      }

      await driver.wait(
        until.urlContains("/Global/bls/visatypeverification"),
        2000
      );

      await driver.sleep(5000);

      await driver.sleep(2000);  

      try {
        const verifyBtn = await driver.findElement(By.id("btnVerify"));
        await verifyBtn.click();
        console.log("Verify Selection button clicked.");
      } catch (e) {
        console.log("Error clicking Verify Selection button:", e.message);
      }

      await driver.sleep(3000);

      await solveCaptchaInIframe(driver);

      await driver.sleep(3000);

      await driver.wait(until.urlContains("/Global/bls/visatype"), 10000);
      await driver.wait(
        until.elementLocated(
          By.css(
            "#JurisdictionId1, #JurisdictionId2, #JurisdictionId3, #JurisdictionId4, #JurisdictionId5"
          )
        ),
        10000
      );
      await driver.sleep(1000);

      await selectFirstVisibleKendoDropdown(
        driver,
        [
          "AppointmentCategoryId1",
          "AppointmentCategoryId2",
          "AppointmentCategoryId3",
          "AppointmentCategoryId4",
          "AppointmentCategoryId5",
        ],
        "Normal"
      );
      await driver.sleep(2000);

      await selectFirstVisibleKendoDropdown(
        driver,
        [
          "JurisdictionId1",
          "JurisdictionId2",
          "JurisdictionId3",
          "JurisdictionId4",
          "JurisdictionId5",
        ],
        "Istanbul"
      );
      await driver.sleep(2000);

      await selectFirstVisibleKendoDropdown(
        driver,
        ["Location1", "Location2", "Location3", "Location4", "Location5"],
        "Istanbul"
      );
      await driver.sleep(2000);

      await selectFirstVisibleKendoDropdown(
        driver,
        ["VisaType1", "VisaType2", "VisaType3", "VisaType4", "VisaType5"],
        "National Visa/ Long Term Visa"
      );
      await driver.sleep(2000);

      await selectFirstVisibleKendoDropdown(
        driver,
        [
          "VisaSubType1",
          "VisaSubType2",
          "VisaSubType3",
          "VisaSubType4",
          "VisaSubType5",
        ],
        "National Visa (More than 90 days)"
      );
      await driver.sleep(2000);

      await driver.sleep(1000);

      // 7. Submit
      const submitBtn = await driver.findElement(By.id("btnSubmit"));
      const isDisplayed = await submitBtn.isDisplayed();
      const isEnabled = await submitBtn.isEnabled();
      const disabledAttr = await submitBtn.getAttribute("disabled");
      const style = await submitBtn.getAttribute("style");
      console.log(
        "btnSubmit: displayed:",
        isDisplayed,
        "enabled:",
        isEnabled,
        "disabledAttr:",
        disabledAttr,
        "style:",
        style
      );

      await driver.wait(until.elementIsVisible(submitBtn), 5000);
      await driver.wait(until.elementIsEnabled(submitBtn), 5000);
      try {
        await submitBtn.click();
        console.log("Form baÅŸarÄ±yla gÃ¶nderildi!");
      } catch (e) {
        console.log("Normal tÄ±klama baÅŸarÄ±sÄ±z, JS ile tÄ±klanÄ±yor...");
        await driver.executeScript("arguments[0].click();", submitBtn);
        console.log("Form JS ile gÃ¶nderildi!");
      }

      await driver.sleep(10000); 
      const modals = await driver.findElements(
        By.css(".modal.show, .modal.fade.show")
      );
      if (modals.length > 0) {
        try {
          const header = await driver.findElement(By.css("#commonModalHeader"));
          const headerText = (await header.getText()).trim();
          if (headerText.toLowerCase().includes("no appointments available")) {
            await sendMessageToTelegram("Vize Bulamadim!");
          } else {
            await sendMessageToTelegram(
              "https://turkey.blsspainglobal.com/Global/Account/LogIn Vize Buldummmm! ðŸ¥³"
            );
          }
        } catch (e) {
        }
        const closeBtns = await driver.findElements(
          By.css(
            ".modal.show .btn-success, .modal.show .btn-primary, .modal.show [data-bs-dismiss]"
          )
        );
        for (const btn of closeBtns) {
          if ((await btn.isDisplayed()) && (await btn.isEnabled())) {
            await btn.click();
            await driver.sleep(1000);
            console.log("Modal closed.");
            break;
          }
        }
      }

      const validation = await driver.findElements(
        By.css(".validation-summary, .text-danger")
      );
      for (const v of validation) {
        if (await v.isDisplayed()) {
          const text = await v.getText();
          if (text.trim()) {
            console.log("Form validation error:", text);
          }
        }
      }
    } catch (e) {
      await driver.quit();
    } finally {
      await driver.quit();
    }
  })();
}


(async function loop() {
  while (true) {
    await main();
    await new Promise(res => setTimeout(res, 15 * 60 * 1000));
  }
})();
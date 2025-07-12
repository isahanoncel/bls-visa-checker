const Tesseract = require('tesseract.js')
const sharp = require('sharp')
const { By, until } = require('selenium-webdriver')

let ocrStats = {
  totalAttempts: 0,
  successfulReads: 0,
  threeDigitReads: 0,
  targetMatches: 0
}

function calculateOCRSuccessRate() {
  if (ocrStats.totalAttempts === 0) return 0;
  return (ocrStats.threeDigitReads / ocrStats.totalAttempts) * 100;
}

function resetOCRStats() {
  ocrStats = {
    totalAttempts: 0,
    successfulReads: 0,
    threeDigitReads: 0,
    targetMatches: 0
  }
}

async function solveCaptchaInIframe(driver, retryCount = 0, maxRetries = 3) {
  try {
    if (retryCount === 0) {
      resetOCRStats();
    }

    try {
      const rateLimitElems = await driver.findElements(By.xpath("//*[contains(text(), 'maximum number of captcha request') or contains(text(), 'Please try after sometime')]"));
      if (rateLimitElems.length > 0) {
        console.log('Rate limiting hatası tespit edildi! 30 saniye bekleniyor...');
        await driver.sleep(30000);
        await driver.navigate().refresh();
        await driver.sleep(5000);
        console.log('Sayfa yenilendi, captcha tekrar deneniyor...');
        if (retryCount < maxRetries) {
          return await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
        }
        return;
      }
    } catch (e) {}

    const targetNumber = await findTargetNumber(driver);
    console.log('Gerçek hedef sayı:', targetNumber);
    await selectCaptchaBoxes(driver, targetNumber);

    const successRate = calculateOCRSuccessRate();
    console.log(`OCR Başarı Oranı: ${successRate.toFixed(1)}% (${ocrStats.threeDigitReads}/${ocrStats.totalAttempts})`);
    
    if (successRate < 30 && ocrStats.targetMatches === 0 && ocrStats.totalAttempts > 5) {
      console.log('OCR başarı oranı çok düşük (%30 altında) ve hiç hedef eşleşmesi yok. Captcha kesiliyor...');
      await driver.switchTo().defaultContent();
      return;
    }

    await driver.sleep(2000);
    await driver.switchTo().defaultContent();

    let alertPresent = false;
    try {
      while (true) {
        await driver.wait(until.alertIsPresent(), 1000);
        const alert = await driver.switchTo().alert();
        const alertText = await alert.getText();
        console.log('Alert bulundu:', alertText);
        
        
        if (alertText.includes('maximum number of captcha request') || alertText.includes('Please try after sometime')) {
          console.log('Rate limiting alert found! 30 seconds waiting...');
          await alert.accept();
          await driver.sleep(30000);
          
          await driver.navigate().refresh();
          await driver.sleep(5000);
          console.log('Page refreshed, trying captcha again...');
          if (retryCount < maxRetries) {
            return await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
          }
          return;
        }
        
        alertPresent = true;
        await alert.accept();
        await driver.sleep(500);
      }
    } catch (e) {
      
    }

    if (alertPresent && retryCount < maxRetries) {
      console.log(`Retrying captcha (alert)! (${retryCount + 1}/${maxRetries})`);
      await driver.sleep(2000 + Math.floor(Math.random() * 2000));
      await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
      return;
    } else if (alertPresent) {
      console.log('Max retry limit reached (alert), captcha solving failed.');
      return;
    }

    let invalid = false;
    try {
      const errorElems = await driver.findElements(By.xpath("//*[contains(text(), 'Invalid captcha') or contains(text(), 'invalid captcha') or contains(text(), 'Geçersiz') or contains(text(), 'Yanlış')]"));
      if (errorElems.length > 0) {
        invalid = true;
        console.log('Invalid captcha message found!');
      }
      const modalOpen1 = await driver.findElements(By.css('iframe[title="Verify Selection"]'));
      const modalOpen2 = await driver.findElements(By.css('iframe[title="Verify Registration"]'));
      if ((modalOpen1.length > 0 || modalOpen2.length > 0) && !invalid) {
        invalid = true;
        console.log('CAPTCHA modal is still open, retrying...');
      }
    } catch (e) {}

    if (invalid && retryCount < maxRetries) {
      console.log(`Retrying captcha... (${retryCount + 1}/${maxRetries})`);
      await driver.sleep(5000 + Math.floor(Math.random() * 5000));
      await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
    } else if (invalid) {
      console.log('Max retry limit reached, captcha solving failed.');
    } else {
      console.log('Captcha successfully solved or modal closed.');
      await driver.sleep(1000);
      try {
        while (true) {
          await driver.wait(until.alertIsPresent(), 1000);
          const alert = await driver.switchTo().alert();
          await alert.accept();
          await driver.sleep(500);
        }
      } catch (e) {}
      try {
        await driver.wait(until.elementLocated(By.id('btnSubmit')), 10000);
        const submitBtns = await driver.findElements(By.id('btnSubmit'));
        if (submitBtns.length > 0) {
          await submitBtns[0].click();
          console.log('btnSubmit button clicked (any page), continuing...');
        } else {
          console.log('btnSubmit button not found (any page)!');
        }
      } catch (e) {
        console.log('btnSubmit click error:', e.message);
      }
    }
  } catch (e) {
    try {
      let alertCleared = false;
      while (true) {
        await driver.wait(until.alertIsPresent(), 1000);
        const alert = await driver.switchTo().alert();
        const alertText = await alert.getText();
        console.log('Error alert found after:', alertText);

        if (alertText.includes('maximum number of captcha request') || alertText.includes('Please try after sometime')) {
          console.log('Rate limiting alert found! 30 seconds waiting...');
          await alert.accept();
          await driver.sleep(30000);
          
          await driver.navigate().refresh();
          await driver.sleep(5000);
          console.log('Page refreshed, retrying captcha...');
          if (retryCount < maxRetries) {
            return await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
          }
          return;
        }
        
        await alert.accept();
        await driver.sleep(500);
        alertCleared = true;
      }
    } catch (e2) {}
    if (retryCount < maxRetries) {
      console.log(`Error alert found, retrying... (${retryCount + 1}/${maxRetries})`);
      await solveCaptchaInIframe(driver, retryCount + 1, maxRetries);
    } else {
      console.log('Max retry limit reached (after error), captcha solving failed.');
    }
    return;
  }
}

async function findTargetNumber(driver) {
  let captchaFrame;
  try {
    await driver.wait(until.elementLocated(By.css('iframe[title="Verify Selection"]')), 3000);
    captchaFrame = await driver.findElement(By.css('iframe[title="Verify Selection"]'));
    console.log('Verify Selection iframe found (second captcha)');
  } catch (e) {
    try {
      await driver.wait(until.elementLocated(By.css('iframe[title="Verify Registration"]')), 3000);
      captchaFrame = await driver.findElement(By.css('iframe[title="Verify Registration"]'));
      console.log('Verify Registration iframe found (first captcha)');
    } catch (e2) {
      throw new Error('No captcha iframe found!');
    }
  }
  
  await driver.switchTo().frame(captchaFrame)

  const labelDivs = await driver.findElements(By.css('div.box-label'));
  let visibleDivs = [];
  for (let div of labelDivs) {
    try {
      const isDisplayed = await div.isDisplayed();
      if (isDisplayed) {
        const opacity = await div.getCssValue('opacity');
        const display = await div.getCssValue('display');
        const visibility = await div.getCssValue('visibility');
        if (opacity === '1' && display !== 'none' && visibility !== 'hidden') {
          let zIndexRaw = await div.getCssValue('z-index');
          let zIndex = Number.isNaN(parseInt(zIndexRaw)) ? -9999 : parseInt(zIndexRaw);
          const rect = await div.getRect();
          visibleDivs.push({div, zIndex, y: rect.y});
        }
      }
    } catch (e) {}
  }
  if (visibleDivs.length === 0) {
    await driver.switchTo().defaultContent();
    throw new Error('Target number text not found!');
  }
  visibleDivs.sort((a, b) => {
    if (b.zIndex !== a.zIndex) return b.zIndex - a.zIndex;
    return a.y - b.y;
  });
  const topDiv = visibleDivs[0].div;
  const visibleText = await topDiv.getText();
  const match = visibleText.match(/number (\d+)/);
  await driver.switchTo().defaultContent();
  if (match) return match[1];
  throw new Error('Target number not found!');
}

// Find the actual boxes, read with OCR, click those matching the target number, and submit
async function selectCaptchaBoxes(driver, targetNumber) {
  // First, try the "Verify Selection" iframe (for the second captcha)
  let captchaFrame;
  try {
    await driver.wait(until.elementLocated(By.css('iframe[title="Verify Selection"]')), 3000);
    captchaFrame = await driver.findElement(By.css('iframe[title="Verify Selection"]'));
    console.log('Verify Selection iframe found (second captcha)');
  } catch (e) {
    // Otherwise, try the "Verify Registration" iframe (for the first captcha)
    try {
      await driver.wait(until.elementLocated(By.css('iframe[title="Verify Registration"]')), 3000);
      captchaFrame = await driver.findElement(By.css('iframe[title="Verify Registration"]'));
      console.log('Verify Registration iframe found (first captcha)');
    } catch (e2) {
      throw new Error('No captcha iframe found!');
    }
  }
  
  await driver.switchTo().frame(captchaFrame)

  const boxImgs = await driver.findElements(By.css('div.col-4 img'));
  let visibleBoxes = [];
  
  // Önce tüm kutuları analiz et ve görünenleri topla
  for (let [i, img] of boxImgs.entries()) {
    try {
      const isDisplayed = await img.isDisplayed();
      if (!isDisplayed) {
        console.log(`[${i}] Box is not visible, skipping.`);
        continue;
      }
      
      const parentDiv = await img.findElement(By.xpath('..'));
      const parentDisplayed = await parentDiv.isDisplayed();
      if (!parentDisplayed) {
        console.log(`[${i}] Parent div is not visible, skipping.`);
        continue;
      }
      
      const pointerEvents = await parentDiv.getCssValue('pointer-events');
      const opacity = await parentDiv.getCssValue('opacity');
      const zIndexRaw = await parentDiv.getCssValue('z-index');
      const zIndex = Number.isNaN(parseInt(zIndexRaw)) ? -9999 : parseInt(zIndexRaw);
      
      if (pointerEvents === 'none' || opacity === '0') {
        console.log(`[${i}] Parent div is not clickable (pointer-events/opacity), skipping.`);
        continue;
      }
      
      // Collect visible box information
      visibleBoxes.push({
        index: i,
        img: img,
        parentDiv: parentDiv,
        zIndex: zIndex,
        opacity: opacity,
        pointerEvents: pointerEvents
      });
      
      console.log(`[${i}] Visible box found - z-index: ${zIndex}, opacity: ${opacity}, pointer-events: ${pointerEvents}`);
      
    } catch (e) {
      console.log(`[${i}] Box analysis failed:`, e.message);
    }
  }

  // Sort visible boxes by z-index (higher z-index first)
  visibleBoxes.sort((a, b) => b.zIndex - a.zIndex);

  console.log(`Total ${visibleBoxes.length} visible boxes found. Z-index order:`);
  visibleBoxes.forEach((box, idx) => {
    console.log(`  ${idx + 1}. Box[${box.index}] - z-index: ${box.zIndex}`);
  });

  // Only perform OCR on visible boxes
  let foundAny = false;
  for (let [visibleIdx, box] of visibleBoxes.entries()) {
    const { index: i, img, parentDiv } = box;
    console.log(`[${visibleIdx + 1}/${visibleBoxes.length}] Processing visible box (Original index: ${i})`);

    try {
      const base64src = await img.getAttribute('src');
      let cleanText = '';
      let ocrSuccess = false;
      // Advanced image processing parameters
      let ocrTries = [
        // Basic operations
        { name: 'basic_high_contrast', threshold: 160, psm: 8, resize: 2, brightness: 1.2, contrast: 1.5, sharpen: true, normalize: true },
        { name: 'basic_low_contrast', threshold: 120, psm: 8, resize: 2, brightness: 1.1, contrast: 1.3, sharpen: true, normalize: true },
        // High resolution attempts
        { name: 'high_res_aggressive', threshold: 180, psm: 7, resize: 3, brightness: 1.3, contrast: 1.8, sharpen: true, normalize: true, blur: 0.5 },
        { name: 'high_res_soft', threshold: 140, psm: 8, resize: 3, brightness: 1.0, contrast: 1.2, sharpen: false, normalize: true },
        // Morphological operations
        { name: 'morphological', threshold: 200, psm: 8, resize: 2, brightness: 1.4, contrast: 2.0, sharpen: true, normalize: true, erode: true },
        // Noise reduction
        { name: 'noise_reduction', threshold: 150, psm: 8, resize: 2, brightness: 1.1, contrast: 1.4, sharpen: false, normalize: true, blur: 0.3 },
        // Edge enhancement
        { name: 'edge_enhancement', threshold: 170, psm: 7, resize: 2, brightness: 1.2, contrast: 1.6, sharpen: true, normalize: true, emboss: true },
        // Adaptive threshold simulation
        { name: 'adaptive_threshold', threshold: 130, psm: 8, resize: 2, brightness: 1.0, contrast: 1.3, sharpen: true, normalize: false, gamma: 1.1 },
        // Color channel-based operations
        { name: 'red_channel', channel: 'red', threshold: 150, psm: 8, resize: 2, brightness: 1.2, contrast: 1.5, sharpen: true, normalize: true },
        { name: 'green_channel', channel: 'green', threshold: 150, psm: 8, resize: 2, brightness: 1.2, contrast: 1.5, sharpen: true, normalize: true },
        { name: 'blue_channel', channel: 'blue', threshold: 150, psm: 8, resize: 2, brightness: 1.2, contrast: 1.5, sharpen: true, normalize: true },
        // Aggressive morphological operations
        { name: 'aggressive_erode', threshold: 180, psm: 8, resize: 2, brightness: 1.3, contrast: 1.7, sharpen: true, normalize: true, erode: true, blur: 0.7 },
        { name: 'aggressive_blur', threshold: 160, psm: 8, resize: 2, brightness: 1.1, contrast: 1.2, sharpen: false, normalize: true, blur: 1.2 }
      ];
      for (let tryIdx = 0; tryIdx < ocrTries.length; tryIdx++) {
        const config = ocrTries[tryIdx];
        let processedBuffer;
        try {
          let sharpImg = sharp(Buffer.from(base64src.split(',')[1], 'base64')).grayscale();
          // Color channel-based processing
          if (config.channel) {
            const raw = await sharp(Buffer.from(base64src.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
            const { data, info } = raw;
            let channelIdx = 0;
            if (config.channel === 'red') channelIdx = 0;
            if (config.channel === 'green') channelIdx = 1;
            if (config.channel === 'blue') channelIdx = 2;
            // Only take the relevant channel
            let channelData = Buffer.alloc(info.width * info.height);
            for (let px = 0; px < info.width * info.height; px++) {
              channelData[px] = data[px * info.channels + channelIdx];
            }
            sharpImg = sharp(channelData, { raw: { width: info.width, height: info.height, channels: 1 } });
          }
          sharpImg = sharpImg.resize({ width: 150 * (config.resize || 2), height: 80 * (config.resize || 2), kernel: sharp.kernel.nearest });
          if (config.brightness !== 1.0 || config.contrast !== 1.0) {
            sharpImg = sharpImg.modulate({ brightness: config.brightness, contrast: config.contrast });
          }
          if (config.gamma) {
            sharpImg = sharpImg.gamma(config.gamma);
          }
          if (config.normalize) {
            sharpImg = sharpImg.normalize();
          }
          if (config.blur) {
            sharpImg = sharpImg.blur(config.blur);
          }
          if (config.sharpen) {
            sharpImg = sharpImg.sharpen();
          }
          if (config.emboss) {
            sharpImg = sharpImg.convolve({ width: 3, height: 3, kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2] });
          }
          sharpImg = sharpImg.threshold(config.threshold);
          if (config.erode) {
            sharpImg = sharpImg.convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, 1, 1, 0, 1, 0] });
          }
          // ALWAYS TAKE AS PNG
          processedBuffer = await sharpImg.png().toBuffer();
        } catch (err) {
          console.log(`[${i}] Image processing error (${config.name}):`, err.message);
          processedBuffer = Buffer.from(base64src.split(',')[1], 'base64');
        }
        ocrStats.totalAttempts++;
        const { data: { text } } = await Tesseract.recognize(
          processedBuffer,
          'eng',
          {
            logger: m => console.log(`[OCR ${i}][${config.name}]`, m.status),
            config: `tessedit_char_whitelist=0123456789 --psm ${config.psm} classify_bln_numeric_mode=1`
          }
        );
        cleanText = text.replace(/\D/g, '');
        // Only accept 3-digit numbers
        if (!/^\d{3}$/.test(cleanText)) {
          console.log(`[${i}] OCR result is not 3 digits (${config.name}):`, cleanText);
          continue;
        }
        ocrStats.threeDigitReads++;
        console.log(`[${i}] OCR result (${config.name}):`, cleanText);
        if (cleanText === targetNumber) {
          ocrStats.targetMatches++;
          ocrSuccess = true;
          console.log(`[${i}] ✅ TARGET FOUND! (${config.name}) - OCR: ${cleanText}, Target: ${targetNumber}`);
          break;
        }
      }
      if (ocrSuccess) {
        foundAny = true;
        let clicked = false;
        try {
          await parentDiv.click();
          clicked = true;
          console.log(`[${i}] Parent div clicked, OCR: ${cleanText}`);
        } catch (e) {
          try {
            await img.click();
            clicked = true;
            console.log(`[${i}] Img clicked, OCR: ${cleanText}`);
          } catch (e2) {
            await driver.executeScript('arguments[0].click();', parentDiv);
            clicked = true;
            console.log(`[${i}] Parent div clicked by JS, OCR: ${cleanText}`);
          }
        }
        if (clicked) await driver.sleep(500);
      } else {
        console.log(`[${i}] Box OCR result did not match target or is not 3 digits. Last OCR: ${cleanText}, Target: ${targetNumber}`);
        console.log(`[${i}] Skipped box base64 image:`, base64src);
      }
    } catch (e) {
      console.log(`[${i}] Box could not be processed:`, e.message);
    }
  }
  if (!foundAny) {
    console.log('No box was clicked, there may be an OCR or selector error.');
  }

  let submitted = false;
  try {
    const submitIcon = await driver.findElement(By.css('i#submit'));
    await submitIcon.click();
    console.log('CAPTCHA submitted (i#submit)');
    submitted = true;
  } catch (e) {
    try {
      const submitDiv = await driver.findElement(By.css('div.img-action-div[onclick*="onSubmit"]'));
      await submitDiv.click();
      console.log('CAPTCHA submitted (div.img-action-div)');
      submitted = true;
    } catch (e2) {
      try {
        await driver.executeScript('onSubmit()');
        console.log('CAPTCHA submitted (JS onSubmit())');
        submitted = true;
      } catch (e3) {
        console.log('CAPTCHA submit failed:', e3.message);
      }
    }
  }
  if (!submitted) {
    console.log('Submit button not found!');
  }
  await driver.switchTo().defaultContent();
}

module.exports = {
  solveCaptchaInIframe,
  findTargetNumber,
  selectCaptchaBoxes,
  calculateOCRSuccessRate,
  resetOCRStats,
  ocrStats
}
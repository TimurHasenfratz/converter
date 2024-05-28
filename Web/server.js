const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const puppeteer = require('puppeteer');
const pdfPoppler = require('pdf-poppler');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files from the current directory

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/generate-pdf', async (req, res) => {
  const { url,css, js } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Set the viewport to simulate a desktop screen
    await page.setViewport({ width: 1280, height: 800 });

    // Function to crawl the page
    const crawlPage = async () => {
      console.log('Crawling page:', url);

      // Combine the user-provided CSS with the fixed CSS
      const combinedCSS = `
   
        ${css}
      `;
      
      // Add the combined CSS to the page
      await page.addStyleTag({ content: combinedCSS });
      
      const removeLazyLoadingScript = `
      function removeLazyLoading() {
        const lazyImages = document.querySelectorAll('img[loading], img[data-src], img[data-lazy], img.lazyload');

        lazyImages.forEach(img => {
          if (img.hasAttribute('loading')) {
            img.removeAttribute('loading');
          }
          if (img.hasAttribute('data-src')) {
            img.setAttribute('src', img.getAttribute('data-src'));
            img.removeAttribute('data-src');
          }
          if (img.hasAttribute('data-lazy')) {
            img.setAttribute('src', img.getAttribute('data-lazy'));
            img.removeAttribute('data-lazy');
          }
          if (img.hasAttribute('data-srcset')) {
            img.setAttribute('srcset', img.getAttribute('data-srcset'));
            img.removeAttribute('data-srcset');
          }
          if (img.classList.contains('lazyload')) {
            img.classList.remove('lazyload');
          }
        });

        lazyImages.forEach(img => {
          const src = img.src;
          img.src = '';
          img.src = src;
        });

        console.log('Lazy loading removed from all images.');
      }

      removeLazyLoading();
    `;

    if (js) {
      await page.evaluate(js);
    }

    await page.evaluate(removeLazyLoadingScript);
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const base64Image = screenshotBuffer.toString('base64');
    const imageSrc = `data:image/png;base64,${base64Image}`;

      // Evaluate the custom JavaScript on the page
      if (js) {
        await page.evaluate(js);
      }

      // Generate PDF
      const pdfPath = 'example.pdf';
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });

      console.log('PDF generated:', pdfPath);

      // Convert PDF to image
      const opts = {
        format: 'png',
        out_dir: path.dirname(pdfPath),
        out_prefix: path.basename(pdfPath, path.extname(pdfPath)),
        page: 1 // Convert only the first page for preview
      };
      await pdfPoppler.convert(pdfPath, opts);

      const imagePath = path.join(opts.out_dir, `${opts.out_prefix}-1.png`);
      res.redirect(`/?previewImage=${imagePath}`);
      
      // Close browser
      await browser.close();
    };

    // Function to click navbar elements and crawl
    const clickNavbarAndCrawl = async () => {
      try {
        const navbarLinks = await page.$$eval('.navbar a', links => links.map(link => link.href));
        console.log('Navbar links:', navbarLinks);

        for (const link of navbarLinks) {
          console.log('Clicking navbar link:', link);
          await page.goto(link, { waitUntil: 'networkidle2' });
          await crawlPage();
        }
      } catch (error) {
        console.error('Error clicking navbar link:', error);
      }
    };

    // Start crawling
    await crawlPage();

    // Click navbar elements and crawl
    await clickNavbarAndCrawl();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

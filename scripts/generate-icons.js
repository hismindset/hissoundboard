const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');
const { Jimp } = require('jimp');

const inputPath = path.join(__dirname, '../resources/icon.png');
const outputPathIco = path.join(__dirname, '../resources/icon.ico');
const outputPathIcns = path.join(__dirname, '../resources/icon.icns');

(async () => {
    console.log('Reading input:', inputPath);
    try {
        const image = await Jimp.read(inputPath);

        console.log('Resizing to 1024x1024...');
        await image.resize({ w: 1024, h: 1024 });

        // Save squared PNG back for Linux usage
        console.log('Saving squared PNG...');
        await image.write(inputPath); // Overwrite original with square/clean version

        const buffer = await image.getBuffer('image/png');
        console.log('Image buffer size:', buffer.length);

        console.log('Generating ICO...');
        const outputIco = png2icons.createICO(buffer, png2icons.BICUBIC2, 0, false, true);
        if (outputIco) {
            fs.writeFileSync(outputPathIco, outputIco);
            console.log('ICO generated:', outputPathIco);
        } else {
            console.error('Failed to generate ICO');
        }

        console.log('Generating ICNS...');
        const outputIcns = png2icons.createICNS(buffer, png2icons.BICUBIC2, 0);
        if (outputIcns) {
            fs.writeFileSync(outputPathIcns, outputIcns);
            console.log('ICNS generated:', outputPathIcns);
        } else {
            console.error('Failed to generate ICNS');
        }
    } catch (err) {
        console.error('Error processing image:', err);
    }
})();

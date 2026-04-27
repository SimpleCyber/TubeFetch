const youtubedl = require('youtube-dl-exec');

async function test() {
    try {
        console.log("Fetching formats for 4Ic-3EaV-w8...");
        const output = await youtubedl('https://www.youtube.com/watch?v=4Ic-3EaV-w8', {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            forceIpv4: true,
            userAgent: '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"',
            referer: 'https://www.youtube.com',
            extractorArgs: 'youtube:player_client=android,web'
        });
        
        console.log("Title:", output.title);
        console.log("Formats available:");
        output.formats.forEach(f => {
            console.log(`${f.format_id}: ${f.resolution || f.quality} (${f.ext}) - ${f.vcodec}/${f.acodec}`);
        });
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();

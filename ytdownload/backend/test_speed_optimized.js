const youtubedl = require('youtube-dl-exec');

async function test() {
    const url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
    console.time('fetchInfoOptimized');
    try {
        const output = await youtubedl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            noPlaylist: true,
            youtubeSkipDashManifest: true,
            noCallHome: true,
            noCacheDir: true,
        });
        console.timeEnd('fetchInfoOptimized');
        console.log('Title:', output.title);
    } catch (e) {
        console.error(e);
    }
}

test();

const youtubedl = require('youtube-dl-exec');

// Clean URL (no &list= / &index=) — avoids Windows cmd & splitting
const url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

async function test() {
    console.log('Testing URL:', url);
    console.time('fetchInfo');
    try {
        const output = await youtubedl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            noPlaylist: true,
            addHeader: 'referer:youtube.com',
        });
        console.timeEnd('fetchInfo');
        console.log('✅ Title:', output.title);
        console.log('   Formats available:', output.formats.length);
    } catch (e) {
        console.timeEnd('fetchInfo');
        console.error('❌ Error:', e.stderr || e.message);
    }
}

test();

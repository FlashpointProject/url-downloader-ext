import * as flashpoint from "flashpoint-launcher";

import path from "path"
import fs from "fs";
const fsp = fs.promises;

import clipboard from "clipboardy";
import _fetch, {RequestInfo, RequestInit} from "node-fetch";
import { PromisePool } from "@supercharge/promise-pool";
import { VM } from "vm2";



const NAME = "URL Downloader";
const CURATIONS = "./Curations/Working/";

const DOWNLOAD = (a: any, b: any) => `Download ${a} URLs from clipboard into Curation "${b}"?`;
const DOWNLOAD_SUCCESS = (a: any) => `${a} URLs downloaded successfully`;
const DOWNLOAD_URLFAIL = (a: any) => `${a} URLs could not be fetched`;
const DOWNLOAD_FILEFAIL = (a: any) => `${a} URLs failed to be written due to a file error`
const DOWNLOAD_FAIL = "What do you want to do with the failed URLs?";

const URLS = /^[^/:]*?(([a-z]*:?\/\/)?[a-z0-9_-]+(\.\w+)+.*?)[\s"']/gm;
const PROTOCOL = /^([a-z]*:?\/\/)?/;
const PROPER_PROTOCOL = /^[a-z]+:\/\//;
const WAYBACK = /^[^/:]*?:\/\/web\.archive\.org\/web\/(\d+)\w+\//;



const config = (k: string) => flashpoint.getExtConfigValue("com.curator-tools.downloader."+k);

export function activate(context: flashpoint.ExtensionContext) {
    // Shortcut method to quickly register commands.
    function registerCmd(n: string, f: (...args: any) => any) {
        flashpoint.registerDisposable(
            context.subscriptions,
            flashpoint.commands.registerCommand(n, f)
        );
    }

    registerCmd("curator-tools.download", async curation => {
        // Ensure output folder exists
        const out = CURATIONS + curation.folder + "/content";
        await fsp.mkdir(out);

        const dupsok = config("duplicates");
        const wayback = config("wayback");
        const keepargs = config("keep-vars");

        let success = 0;
        let urlfail = 0;
        let filefail = 0;

        let total = 0;
        let done = 0;

        const failed: string[] = [];
        let failedstr = "";

        // Create downloader function
        async function fetch(url: string, data?: RequestInit) {
            // Add id_ to wayback urls
            if (wayback) url.replace(WAYBACK, "https://web.archive.org/web/$1id_/");

            const resp = await _fetch(url, data);
            ++done;
            if (resp.ok) {
                flashpoint.log.info(`${done}/${total} ${Math.floor(done/total * 100)}%; ${resp.status} ${resp.statusText}: ${url}`);

                try {
                    // Normalize the output location
                    const purl = new URL(wayback ? url.replace(WAYBACK, "") : url);
                    let pathname = purl.pathname.replace(/:/g, "%3A").replace(/%20/g, " ");

                    // We try not to download folders.
                    if (pathname.endsWith("/")) pathname += "index.html";
                    // Add args if wanted
                    if (keepargs && purl.search) pathname += "@" + purl.search.substring(1);

                    let loc = out + pathname;
                    let x = 1;
                    if (fs.existsSync(loc)) {
                        while (fs.existsSync(loc + " " + ++x));
                        loc += " " + x;
                    }

                    // File does not exist, so write to location freely
                    await fsp.mkdir(path.dirname(loc));
                    fs.writeFileSync(loc, await resp.text()); // Synchronous in case two files override each other

                    ++success;
                    return;
                } catch (err) {
                    flashpoint.log.error(`Failed to write to file for URL "${url}": ${err}`);
                    ++filefail;
                }
            } else {
                flashpoint.log.error(`${resp.status} ${resp.statusText}: ${url}`);
                ++urlfail;
            }

            if (data) {
                failed.push(`fetch("${url}", ${JSON.stringify(data)});`);
            } else {
                failed.push(url);
            }
        }

        // Read data from the clipboad
        const data = await clipboard.read();

        // Determine if the clipboard has "Copy all as Node.js fetch" content, and that we are not downgrading requests
        if (!config("downgrade") && data.substring(0, 7) == 'fetch("') {
            // If so, run special code because we can handle it
            const requests = data.split(/; ;\r?\n/g);
            total = requests.length;

            // Prompt for continue
            const v = await flashpoint.dialogs.showMessageBox({
                title: NAME,
                message: DOWNLOAD(total, curation.game.title),
                buttons: ["Yes", "No"]
            });
            if (v) return;

            // Load up promise pool and do some downloading! With a VM so it's safer I think
            const vm = new VM({
                eval: false,
                wasm: false,
                sandbox: { fetch }
            });
            await PromisePool
                .withConcurrency(parseInt(config("concurrency")))
                .for(requests)
                .process(async request => await vm.run(`async () => ${request}`)());
            
            // Combine failed requests into one message
            failedstr = failed.join(" ;\n") + "\n";
        } else {
            // It does not, so use regex to locate urls
            const urls = [];
            for (const url of data.matchAll(URLS)) {
                const turl = url[1];
                urls.push(turl.match(PROPER_PROTOCOL) ? turl : turl.replace(PROTOCOL, "http://"));
            }
            total = urls.length;

            // Prompt for continue
            const v = await flashpoint.dialogs.showMessageBox({
                title: NAME,
                message: DOWNLOAD(total, curation.game.title),
                buttons: ["Yes", "No"]
            });
            if (v) return;

            // Load up promise pool and do some downloading!
            await PromisePool
                .withConcurrency(parseInt(config("concurrency")))
                .for(urls)
                .process(async url => fetch(url));
            
            // Combine failed urls into one message;
            failedstr = failed.join("\n") + "\n";
        }

        if (failed.length) {
            // If anything failed, we need to let the user know
            const message = [DOWNLOAD_SUCCESS(success)];
            if (urlfail) message.push(";\n", DOWNLOAD_URLFAIL(urlfail));
            if (filefail) message.push(";\n", DOWNLOAD_FILEFAIL(filefail));
            message.push(".\n\n", DOWNLOAD_FAIL);

            const v = await flashpoint.dialogs.showMessageBox({
                title: NAME,
                message: message.join(""),
                buttons: ["Ignore", "Copy"]
            });
            if (v == 1) await clipboard.write(failedstr);
        } else {
            // All urls successfully downloaded
            flashpoint.dialogs.showMessageBox({
                title: NAME,
                message: "All " + DOWNLOAD_SUCCESS(success) + "."
            });
        }
    });
}
import arg from 'arg';
import puppeteer from 'puppeteer';
import { color, log, red, green, cyan, cyanBright } from 'console-log-colors';
import fs from 'fs';
import path from 'path';

function parseArgumentsIntoOptions(rawArgs) {
    const args = arg(
        {
            '--test': Boolean,
            '--build': Boolean,
            '--help': Boolean,
            '-h': '--help',
            '-t': '--test',
            '-b': '--build',
        },
        {
            argv: rawArgs.slice(2),
        }
    );
    const currentDirectory = process.cwd();
    return {
        currentDir: currentDirectory,
        testing: args['--test'] || false,
        building: args['--build'] || false,
        template: args._[0],
        url: args._[1]
    };
}

async function promptForMissingOptions(options) {
    const defaultTemplate = 'search';
    return {
        ...options,
        template: options.template || defaultTemplate,
        url: options.url
    };
}

async function run(url, js, usesApi, imports) {
    try {
        // Fetch the HTML content from the provided URL
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        page
            .on('console', message =>
                console.log(`${message.type().substr(0, 3).toUpperCase()}: ${message.text()}`))
            .on('pageerror', ({ message }) => console.log(message))
            .on('requestfailed', request =>
                console.log(`${request.failure().errorText} ${request.url()}`))

        // Disable JavaScript execution on the page
        await page.setJavaScriptEnabled(false);

        if (usesApi) {
            console.log("API!")
            await page.setContent(url);
        } else {
            await page.goto(url);
        }

        // Enable JavaScript execution
        await page.setJavaScriptEnabled(true);
        const htmlContent = await page.content();
        page.sc

        if (imports != null) {
            for (const imp in imports) {
                if (Object.hasOwnProperty.call(imports, imp)) {
                    const element = imports[imp];
                    await page.addScriptTag({ url: element });
                }
            }
        }


        // Inject and execute a simple JavaScript script
        const result = await page.evaluate((js) => {
            let choutenDivElement = document.createElement('div');
            choutenDivElement.setAttribute('id', 'chouten');
            document.body.prepend(choutenDivElement);
            const scriptElement = document.createElement('script');
            scriptElement.textContent = js;
            document.body.appendChild(scriptElement);

            // Clean up the script element after executing the code
            document.body.removeChild(scriptElement);
            let choutenDiv = document.getElementById('chouten');
            return choutenDiv.innerText;
        }, js);

        // Print the result to the console
        var str = JSON.stringify(JSON.parse(result), null, 2);
        console.log('Result:', str);

        // Close the browser
        await browser.close();
        return JSON.parse(result).nextUrl
    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

async function getFileData() {

}

export async function cli(args) {
    let options = parseArgumentsIntoOptions(args);
    options = await promptForMissingOptions(options);
    console.log(options.currentDir)

    const metadataFilePath = path.join(options.currentDir, 'metadata.json');

    // Check if the metadata.json file exists
    if (fs.existsSync(metadataFilePath)) {
        try {
            // Read the contents of the metadata.json file
            const metadataJson = fs.readFileSync(metadataFilePath, 'utf8');

            // Parse the JSON contents
            const metadata = JSON.parse(metadataJson);

            // Log the JSON data
            console.log('Name:', metadata.name);
            console.log('Author:', metadata.general.author);
            console.log('Version:', metadata.version);
            console.log('Format Version:', metadata.formatVersion);
        } catch (error) {
            console.error('Error reading or parsing metadata.json:', error);
        }
    } else {
        console.log('metadata.json does not exist in the current directory.');
        return
    }

    if (!options.url) {
        console.log("URL is required");
        return
    }

    if(options.testing) {
        switch (options.template) {
            case "search":
                console.log(cyan.bold(`Testing Search on `) + red.bold(options.url));
                
                var jsFile = path.join(options.currentDir, 'Search/code.js');
                var js = fs.readFileSync(jsFile, 'utf8');
                var match = js.split('function logic() {')[1].trimEnd();
                match = match.substring(0, match.length - 1);
    
                var requestUrl = js.split('function logic() {')[0].trimEnd();
                let ret = JSON.parse(eval(`${requestUrl}requestData()`));
                var nextUrl = ""
                
                if (ret.request != null && ret.request.url != null) {
                    var url = ret.request.url.replace('<query>', options.url).replaceAll(' ', ret.separator || "%20");
                    console.log(red.bold(ret.request.url.replace('<query>', options.url).replaceAll(' ', ret.separator || "%20")));
                    if (ret.usesApi) {
                        console.log(ret.usesApi);
        
                        var html = JSON.stringify(await (await fetch(!nextUrl ? url : nextUrl)).json())
                        // sanitize html
                        //let regexPattern = /&#\\d+;/;
                        var cleaned = html.replaceAll("&#39;", "");
                        cleaned = cleaned.replaceAll("'", "").replaceAll('"', "'");
        
                        var converted = `
                            <html>
                            <head>
                            <title>My Page</title>
                            </head>
                            <body>
                                <div id="json-result" data-json="${cleaned}">UNRELATED</div>
                            </body>
                            </html>
                        `;
        
                        nextUrl = await run(converted, match, true, ret.imports);
                    } else {
                        nextUrl = await run(!nextUrl ?  url : nextUrl, match, false, ret.imports);
                    }
                }
                break;
            case "info":
                console.log(cyan.bold(`Testing Info on `) + red.bold(options.url));
                fs.readdir(path.join(options.currentDir, 'Info'), async (err, files) => {
                    if (err) {
                        console.error('Error reading directory:', err);
                        return;
                    }
    
                    // Filter the files to include only JavaScript files
                    const jsFiles = files.filter(file => path.extname(file) === '.js');
                    console.log(`Number of JavaScript files in ${path.join(options.currentDir, 'Info')}: ${jsFiles.length}`);
                    var nextUrl = ""
    
                    for (const file in jsFiles) {
                        if (Object.hasOwnProperty.call(jsFiles, file)) {
                            const element = jsFiles[file];
    
                            console.log(green.bold(`Running ${element}`));
                            jsFile = path.join(options.currentDir, `Info/${element}`);
                            js = fs.readFileSync(jsFile, 'utf8');
                            var match = js.split('function logic() {')[1].trimEnd();
                            match = match.substring(0, match.length - 1);
    
                            var requestUrl = js.split('function logic() {')[0].trimEnd();
                            let ret = JSON.parse(eval(`${requestUrl}requestData()`));
                            if (ret.usesApi) {
                                console.log(ret.usesApi);
    
                                var html = JSON.stringify(await (await fetch(!nextUrl ? options.url : nextUrl)).json())
                                // sanitize html
                                //let regexPattern = /&#\\d+;/;
                                var cleaned = html.replaceAll("&#39;", "");
                                cleaned = cleaned.replaceAll("'", "").replaceAll('"', "'");
    
                                var converted = `
                                <html>
                                <head>
                                  <title>My Page</title>
                                </head>
                                <body>
                                    <div id="json-result" data-json="${cleaned}">UNRELATED</div>
                                </body>
                                </html>
                              `;
    
                                nextUrl = await run(converted, match, true, ret.imports);
                            } else {
                                nextUrl = await run(!nextUrl ? options.url : nextUrl, match, false, ret.imports);
                            }
    
                        }
                    }
    
                });
    
                break;
            case "media":
                console.log(cyan.bold(`Testing Media on `) + red.bold(options.url));
                fs.readdir(path.join(options.currentDir, 'Media'), async (err, files) => {
                    if (err) {
                        console.error('Error reading directory:', err);
                        return;
                    }
    
                    // Filter the files to include only JavaScript files
                    const jsFiles = files.filter(file => path.extname(file) === '.js');
                    console.log(`Number of JavaScript files in ${path.join(options.currentDir, 'Media')}: ${jsFiles.length}`);
                    var nextUrl = ""
    
                    for (const file in jsFiles) {
                        if (Object.hasOwnProperty.call(jsFiles, file)) {
                            const element = jsFiles[file];
    
                            console.log(green.bold(`Running ${element}`));
                            jsFile = path.join(options.currentDir, `Media/${element}`);
                            js = fs.readFileSync(jsFile, 'utf8');
                            var match = js.split('function logic() {')[1].trimEnd();
                            match = match.substring(0, match.length - 1);
    
                            var requestUrl = js.split('function logic() {')[0].trimEnd();
                            let ret = JSON.parse(eval(`${requestUrl}requestData()`));
                            if (ret.usesApi) {
                                console.log(ret.usesApi);
    
                                var html = JSON.stringify(await (await fetch(!nextUrl ? options.url : nextUrl)).json())
                                // sanitize html
                                //let regexPattern = /&#\\d+;/;
                                var cleaned = html.replaceAll("&#39;", "");
                                cleaned = cleaned.replaceAll("'", "").replaceAll('"', "'");
                                var converted = `
                                    <html>
                                    <head>
                                      <title>My Page</title>
                                    </head>
                                    <body>
                                        <div id="json-result" data-json="${cleaned}">UNRELATED</div>
                                    </body>
                                    </html>
                                  `;
                                nextUrl = await run(converted, match, true, ret.imports);
                            } else {
                                nextUrl = await run(!nextUrl ? options.url : nextUrl, match, false, ret.imports);
                            }
    
                        }
                    }
    
                });
    
                break;
            default:
                console.log("UNKNOWN");
                break;
        }
    }
}
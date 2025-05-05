//require('dotenv').config();
const { execSync }       = require('child_process');
const { executablePath } = require('puppeteer');
const puppeteer          = require('puppeteer-extra');
const PEPStealth         = require('puppeteer-extra-plugin-stealth');
const PEPRecaptcha       = require('puppeteer-extra-plugin-recaptcha');
const PEPAnonymize       = require('puppeteer-extra-plugin-anonymize-ua');
const ProxyRouter        = require('@extra/proxy-router');
const crypto             = require('crypto');
const fs                 = require('fs');
const fsp                = require('fs').promises;
const forge              = require('node-forge');
const path               = require('path');
const LOG                = {status:false,error:null,message:null,authorization_siscat:null};
const DIR_CERTS          = '/var/www/html/storage/certificates/';

async function stop_seconds(s){
    await new Promise(resolve => setTimeout(resolve, s * 1000));
}

async function isCertificateValid(p12Path, password) {
    try {
        const p12Buffer = fs.readFileSync(p12Path);
        const p12Asn1   = forge.asn1.fromDer(p12Buffer.toString('binary'));
        const p12       = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
        const certBag   = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0];
        const cert      = certBag.cert;
        const now       = new Date();
        return now >= cert.validity.notBefore && now <= cert.validity.notAfter;
    }catch(error){
        LOG.status      = false;
        LOG.error       = 'certificate-invalid-password';
        LOG.message     = 'A senha do certificado é inválida.';
        await response_json(JSON.stringify(LOG));
        process.exit();
    }
}

async function truncate_log(){
    await fsp.writeFile(DIR_CERTS+process.argv[2]+'.json','',(error)=>{});
}

async function response_json(resp) {
    await fsp.writeFile(DIR_CERTS+process.argv[2]+'.json',resp, (error)=>{});
}
async function console_log(log) {
    console.log(log);
    await fsp.appendFile(DIR_CERTS+process.argv[2]+'.log',log+'\n', (error)=>{});
}

let shouldStop      = false;
function stopMouseMovement() { shouldStop = true; }
async function moveMouseUniformly(page) {
    const width     = 1100;
    const height    = 900;
    const speed     = 1;
    const interval  = 100;
    let x           = width / 2;
    let y           = height / 2;
    let angle       = 0;
    while(!shouldStop) {
        x += speed * Math.cos(angle);
        y += speed * Math.sin(angle);
        x = Math.max(0, Math.min(x, width));
        y = Math.max(0, Math.min(y, height));
        await page.mouse.move(x, y);
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

(async () => {
    console_log('--------------------------- | Iniciando | ---------------------------');
    // :: Valida argumentos necessários
    // [2] = ID
    // [3] = Certificado ( .PFX | .P12 )
    // [4] = Senha
    if(process.argv[2] == undefined || process.argv[3] == undefined || process.argv[4] == undefined){
        LOG.status      = false;
        LOG.error       = 'no-arguments-certificate-and-password';
        LOG.message     = 'Certificado e Senha não especificado durante execução.';
        console.log('- LOG | '+LOG.error+' - '+LOG.message);
        await response_json(JSON.stringify(LOG));
        process.exit();
    }

    // :: Zera o arquivo log
    truncate_log();

    const DIR_PATH_P12    = DIR_CERTS+process.argv[3];
    const CERT_PASSWORD   = process.argv[4];

    // :: Linux -| Validando Data Expirada do Certificado -
    try {
        const CERT_DATE_VALID = await isCertificateValid(DIR_PATH_P12, CERT_PASSWORD);
        if(!CERT_DATE_VALID){
            LOG.status      = false;
            LOG.error       = 'certificate-expired-date';
            LOG.message     = 'A data do certificado expirou.';
            await console_log('- LOG | '+LOG.error+' - '+LOG.message);
            await response_json(JSON.stringify(LOG));
            process.exit();
        }
    }catch(error){
        await console_log(error);
    }

    // :: Linux -| Remoção e Inclusão Certificado e Validação Password
    try {
        execSync(`rm -rf $HOME/.pki/nssdb/*`);
        execSync(`certutil -d sql:$HOME/.pki/nssdb -N -f /dev/null`);
        execSync(`pk12util -d sql:$HOME/.pki/nssdb -i "${DIR_PATH_P12}" -W "${CERT_PASSWORD}" > /dev/null`);
    }catch(error){
        LOG.status      = false;
        if(error.message.includes('SEC_ERROR_BAD_PASSWORD')){
            LOG.error   = 'certificate-invalid-password';
            LOG.message = 'A senha do certificado é inválida.';
        }
        await console_log('- LOG | '+LOG.error+' - '+LOG.message);
        await response_json(JSON.stringify(LOG));
        process.exit();
    }

    const pathToExtension = require('path').join(__dirname, 'noCaptchaAi-chrome-v1.3');
    puppeteer.use(PEPStealth());
    //puppeteer.use(PEPRecaptcha_plugin);
    //puppeteer.use(PEPAnonymize());
    const browser = await puppeteer.launch({
        //executablePath: '/root/.cache/puppeteer/chrome/linux-123.0.6312.122/chrome-linux64/chrome', // Chrome 123.x
        //executablePath: '/root/.cache/chrome/linux-127.0.6494.0/chrome-linux64/chrome', // Chrome Canary 127.x
        //executablePath: '/root/.cache/puppeteer/firefox/linux-stable_126.0/firefox/firefox',
        //devtools: true,
        //ignoreHTTPSErrors: true,
        //protocol: 'webDriverBiDi',
        executablePath: '/root/.cache/chrome/linux-127.0.6485.0/chrome-linux64/chrome', // Chrome Dev 127.x
        product: 'chrome',
        slowMo:250,
        args:[
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
            '--window-size=1100,900',
            //'--incognito',
            //'--window-position=0,0',
            //'--disable-infobars',
            //'--disable-dev-shm-usage',
            //'--disable-web-security',
            //'--disable-features=IsolateOrigins,site-per-process,SitePerProcess',
            //'--flag-switches-begin --disable-site-isolation-trials --flag-switches-end',
            //'--no-proxy-server-list-restrictions',
            //`--proxy-server=http://u482b1b2e57f105d0-zone-custom-region-br-st-bahia-city-salvador:u482b1b2e57f105d0@43.159.28.126:2333`,

        ],
        headless:false,
        //executablePath: executablePath()
    });

    const page = await browser.newPage();

    // ::::::: Ouvintes
    await page.setRequestInterception(true);
    // :: Captando toda a Nevagação e Carregamento Scripts -
    page.on('request', async (request) => {
        const url = request.url();
        //await console_log(url);
        // Captando o Request -| Bearer Authorization
        if(url == 'https://siscat.denatran.serpro.gov.br/acesso/versao'){
            const headers = request.headers();
            if(headers['authorization']) {
                await console_log('- SISCAT - Acesso Principal - Authorization Header: ', headers['authorization']);
                LOG.status               = true;
                LOG.message              = 'Authorization Bearer Success';
                LOG.authorization_siscat = headers['authorization'].replace('Bearer ','');
                await response_json(JSON.stringify(LOG));
                await console_log(JSON.stringify(LOG));
                await console_log('--------------------------- | Finalizado com Sucesso | -');
                process.exit();
            }
        }
        request.continue();
    });
    // - ::
    // :: Captando a Navegação de Resposta
    page.on('response', async (response) => {
        const url = response.url();
        //await console_log(url);
        // :: Verifica se entrou na página de Authorização GOV.BR | SISCAT
        if(url.startsWith('https://sso.acesso.gov.br/authorize') && response.status() === 200){
            stopMouseMovement();
            await console_log('- Acessando | SISCAT - Autorização GOV.BR');
            await stop_seconds(10);
            const BT_Autorizar = await page.$('button.button-ok');
            if(BT_Autorizar){
                await console_log('- Acessando | SISCAT - Autorização GOV.BR - Autorizando Aplicação');
                //await console_log('- Autorizando Aplicação SISCAT - Autorização GOV.BR');
                //await btAutorizar.click();
            }
        }
    });
    // - ::
    // - :::::::

    // :: Acessando Certificado - SSO
    await console_log('- Acessando | certificado.sso.acesso.gov.br:443 -');
    page.goto("https://certificado.sso.acesso.gov.br:443/login?client_id=siscat.estaleiro.serpro.gov.br%2Fautenticacao%2Flogin", { timeout: 60000 });
    await stop_seconds(10);
    await console_log('- Acessando | certificado.sso - Key:ENTER');
    execSync('xdotool key --delay 100 "Return"');

    await stop_seconds(5);
    await page.goto("https://siscat.denatran.serpro.gov.br/acesso/brasilcidadao/login", { waitUntil: 'networkidle0' });

    // :: Simulação Humana
    await console_log('- Acessando | ( SISCAT / GOV.BR ) - Simulação Humana');
    moveMouseUniformly(page);

    // :: Entrada Modo Certificado
    await stop_seconds(10);
    await console_log('- Acessando | ( SISCAT / GOV.BR ) - Entrar com Certificado');
    const BT_EntrarGov = await page.waitForSelector("#login-certificate");
    BT_EntrarGov.click();
    // - ::

    await stop_seconds((60 * 5));
    LOG.error                = 'error-process';
    LOG.message              = '- Erro | Processo Finalizado sem Status - ????';
    await response_json(JSON.stringify(LOG));
    process.exit();

})();
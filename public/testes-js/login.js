//Builder - BY - KEY
const { Builder, By, Key } = require('selenium-webdriver');
const by = require('selenium-webdriver/lib/by');

//Definir a função
async function run() {

    //Criar um novo objeto webdriver
    let driver = await new Builder().forBrowser('chrome').build();

    // await driver.manage().window().maximize();
    await driver.get('http://localhost:3001/login.html'); //Abre a página

    let input_usuario = await driver.findElement(By.xpath('//*[@id="usuario"]'))
    await input_usuario.sendKeys("pedro")
    await driver.sleep(500)

    let input_senha = await driver.findElement(By.xpath('//*[@id="senha"]'))
    await input_senha.sendKeys("123456789")
    await driver.sleep(500)

    let btn_login = await driver.findElement(By.xpath('//*[@id="btn-login"]'))
    await btn_login.click()
    await driver.sleep(3000)

    await driver.quit()
}

run() //Chama a função


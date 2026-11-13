//Builder - BY - KEY
const { Builder, By, Key } = require('selenium-webdriver');

//Definir a função
async function run() {

    //Criar um novo objeto webdriver
    let driver = await new Builder().forBrowser('chrome').build();

    // await driver.manage().window().maximize();
    await driver.get('http://localhost:3001/'); //Abre a página
    await driver.sleep(2000);
    
    //Clica no botao de iniciar pedido
    let botao_inicia = await driver.findElement(By.xpath('//*[@id="botao-iniciar-pedido"]'))
    await botao_inicia.click()
    await driver.sleep(2000)

    await driver.quit()
}

run() //Chama a função


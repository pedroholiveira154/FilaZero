//Builder - BY - KEY
const { Builder, By, Key } = require('selenium-webdriver');
const by = require('selenium-webdriver/lib/by');

//Definir a função
async function run() {

    //Criar um novo objeto webdriver
    let driver = await new Builder().forBrowser('chrome').build();

    // await driver.manage().window().maximize();
    await driver.get('http://localhost:3001/'); //Abre a página

    //Escreve no input
    let input_nome = await driver.findElement(By.xpath('//*[@id="campo-nome-cliente"]'))
    await input_nome.click()
    await input_nome.sendKeys("Teste Auto")
    
    //Clica no botao de iniciar pedido
    const botao_inicia = await driver.findElement(By.xpath('//*[@id="botao-iniciar-pedido"]'))
    await botao_inicia.click()
    await driver.sleep(1000)

    let produto = await driver.findElement(By.xpath('//*[@id="grade-produtos"]/article[1]'))
    await produto.click()
    await driver.sleep(1300)

    let produto2 = await driver.findElement(By.xpath('//*[@id="grade-produtos"]/article[2]'))
    await produto2.click()
    await driver.sleep(1300)

    let produto3 = await driver.findElement(By.xpath('//*[@id="grade-produtos"]/article[3]'))
    await produto3.click()
    await driver.sleep(1300)

    let btn_pedido = await driver.findElement(By.xpath('//*[@id="barra-acao-cardapio"]/button'))
    await btn_pedido.click()
    await driver.sleep(2000)

    let btn_pagar = await driver.findElement(By.xpath('//*[@id="pagina-pedido"]/div/button'))
    await btn_pagar.click()
    await driver.sleep(1000)

    let btn_pagar2 = await driver.findElement(By.xpath('//*[@id="pagina-pagamento"]/div/button'))
    await btn_pagar2.click()
    await driver.sleep(7000)

    driver.quit()
}

run() //Chama a função


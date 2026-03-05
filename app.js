/**
 * app.js - Script de ligação ao broker MQTT test.mosquitto.org via WebSockets
 * Atualiza o Semáforo e os cartões de dados.
 */

// O nosso professor indicou que as luzes do semáforo devem reagir ao tópico "Ruido" (Som).
// O tópico "Ruido" na App MIT envia 1 valor. Mas por vezes no projeto envia o indquar [0, 1, 2].
// A estratégia: se Ruido der um valor, vms definir thresholds para Verde, Amarelo, Vermelho.
// (Ex: < 50 verde, 50-80 amarelo, >80 vermelho). 
// Mas se o tópico apenas enviar [0,1,2] tipo o IndQuAr, leremos isso.
// Assumindo que enviará um número em dB (ex: 60), podemos simular:

const MQTT_BROKER = "wss://test.mosquitto.org:8081";

// DOM Elements - Semáforo
const lightRed = document.getElementById('light-red');
const lightYellow = document.getElementById('light-yellow');
const lightGreen = document.getElementById('light-green');
const statusTitle = document.getElementById('status-title');
const statusText = document.getElementById('status-text');
const statusCardBody = document.getElementById('status-card-body');

// DOM Elements - Valores
const valTemp = document.getElementById('val-temp');
const valHum = document.getElementById('val-hum');
const valPress = document.getElementById('val-press');
const valPm1 = document.getElementById('val-pm1');
const valPm25 = document.getElementById('val-pm25');
const valPm10 = document.getElementById('val-pm10');
const valSound = document.getElementById('val-sound');
const valGas = document.getElementById('val-gas');
const valIndQuar = document.getElementById('val-indquar');

const mqttStatus = document.getElementById('mqtt-status');
const hardwareStatus = document.getElementById('hardware-status'); // Novo indicador de hardware

// Watchdog para verificar se o sensor físico (Semáforo) ainda está vivo
let lastMessageTime = 0;
const WATCHDOG_TIMEOUT_MS = 5000; // 5 segundos sem receber = Desconectado

// Connect to broker
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', function () {
    console.log("Conectado ao broker MQTT!");
    mqttStatus.textContent = "Conectado ao mosquitto.org";
    mqttStatus.className = "badge bg-success";

    // Subscrever os vários tópicos utilizados pela App Inventor
    client.subscribe('Clima');
    client.subscribe('Poeiras');
    client.subscribe('Gazes'); // Na app inventor estava "Gazes"
    client.subscribe('Ruido');
    client.subscribe('IndQuAr');
});

client.on('error', function (err) {
    console.error("Erro MQTT: ", err);
    mqttStatus.textContent = "Erro na ligação";
    mqttStatus.className = "badge bg-danger";
});

client.on('message', function (topic, message) {
    // Atualiza o tempo da última mensagem recebida (regista que o Arduino está vivo!)
    lastMessageTime = Date.now();
    hardwareStatus.textContent = "A enviar dados...";
    hardwareStatus.className = "badge bg-success";

    // message é um Buffer
    const msgStr = message.toString().trim();
    console.log(`Recebido em [${topic}]: ${msgStr}`);

    // Vamos tentar fazer o parse caso a mensagem venha em formato JSON.
    // O Arduino GIGA envia mensagens tipo {"Som":70} ou {"PM10":20}

    let parsedData = {};
    let isJson = false;

    // Tentar limpar a string caso venha com lixo do C (acontece no Arduino)
    let cleanMsgStr = msgStr.replace(/^[^{]*{/, '{').replace(/}[^}]*$/, '}');

    try {
        parsedData = JSON.parse(cleanMsgStr);
        isJson = true;
    } catch (e) {
        // Se falhar o parse JSON, assumimos que é texto/número normal separado por vírgula (formato antigo da App)
        isJson = false;
    }

    const dataParts = msgStr.split(',');

    switch (topic) {
        case 'Clima':
            if (isJson) {
                // Se for JSON, vamos procurar as chaves que conhecemos. 
                // Exemplo da imagem: {"TBme":"21.9"}, {"HBme": "44.7"}, {"Pressão":"1008.1"}
                if (parsedData.hasOwnProperty('TBme')) valTemp.textContent = `${parsedData.TBme} °C`;
                if (parsedData.hasOwnProperty('HBme')) valHum.textContent = `${parsedData.HBme} %`;
                if (parsedData.hasOwnProperty('Pressão')) valPress.textContent = `${parsedData["Pressão"]} hPa`;
                // Caso use chaves mais normais no futuro
                if (parsedData.hasOwnProperty('Temperatura')) valTemp.textContent = `${parsedData.Temperatura} °C`;
                if (parsedData.hasOwnProperty('Humidade')) valHum.textContent = `${parsedData.Humidade} %`;
            } else {
                if (dataParts.length >= 3) {
                    valTemp.textContent = `${dataParts[0]} °C`;
                    valHum.textContent = `${dataParts[1]} %`;
                    valPress.textContent = `${dataParts[2]} hPa`;
                }
            }
            break;

        case 'Poeiras':
            if (isJson) {
                if (parsedData.hasOwnProperty('PM1.0')) valPm1.textContent = parsedData['PM1.0'];
                if (parsedData.hasOwnProperty('PM2.5')) valPm25.textContent = parsedData['PM2.5'];
                if (parsedData.hasOwnProperty('PM10')) valPm10.textContent = parsedData['PM10'];
            } else {
                if (dataParts.length >= 3) {
                    valPm1.textContent = dataParts[0];
                    valPm25.textContent = dataParts[1];
                    valPm10.textContent = dataParts[2];
                }
            }
            break;

        case 'Gazes':
            if (isJson) {
                if (parsedData.hasOwnProperty('CO2')) valGas.textContent = parsedData.CO2;
                if (parsedData.hasOwnProperty('Gases')) valGas.textContent = parsedData.Gases;
            } else {
                if (dataParts.length > 0) valGas.textContent = dataParts[0];
            }
            break;

        case 'IndQuAr':
            if (isJson) {
                if (parsedData.hasOwnProperty('IndQuAr')) valIndQuar.textContent = parsedData.IndQuAr;
            } else {
                if (dataParts.length > 0) valIndQuar.textContent = dataParts[0];
            }
            break;

        case 'Ruido':
            let ruidoVal = 0;
            let temRuido = false;

            if (isJson) {
                if (parsedData.hasOwnProperty('Som')) {
                    ruidoVal = parseFloat(parsedData.Som);
                    temRuido = true;
                }
            } else {
                if (dataParts.length > 0 && !isNaN(parseFloat(dataParts[0]))) {
                    ruidoVal = parseFloat(dataParts[0]);
                    temRuido = true;
                }
            }

            if (temRuido) {
                valSound.textContent = ruidoVal.toFixed(1);
                updateTrafficLightForSound(ruidoVal);
            }
            break;
    }
});

/**
 * Função que controla as cores do Semáforo consoante o Som
 * Thresholds (podem ser ajustados):
 * Verde: < 70 dB (Calmo)
 * Amarelo: 70 a 75 dB (Moderado)
 * Vermelho: >= 76 dB (Barulhento)
 */
function updateTrafficLightForSound(ruidoDba) {
    if (isNaN(ruidoDba)) return;

    // Reset todas as luzes para apagado
    lightRed.className = "light light-off";
    lightYellow.className = "light light-off";
    lightGreen.className = "light light-off";

    // Reset estilos do card
    statusCardBody.className = "card-body text-center text-white";

    if (ruidoDba < 70) {
        // VERDE (69 para baixo)
        lightGreen.className = "light light-on";
        statusCardBody.classList.add("bg-success");
        statusTitle.textContent = "Ambiente Calmo";
        statusText.textContent = "O nível de ruído está confortável (Abaixo de 70 dBA).";

    } else if (ruidoDba >= 70 && ruidoDba <= 75) {
        // AMARELO (70 a 75)
        lightYellow.className = "light light-on";
        statusCardBody.classList.add("bg-warning");
        statusCardBody.classList.remove("text-white"); // amarelo precisa texto escuro
        statusTitle.textContent = "Ruído Moderado";
        statusText.textContent = "Nível de ruído de atenção. O ambiente começa a ficar agitado.";

    } else {
        // VERMELHO (76 para cima)
        lightRed.className = "light light-on";
        statusCardBody.classList.add("bg-danger");
        statusTitle.textContent = "Ambiente Ruidoso!";
        statusText.textContent = "Níveis de ruído altos! Cuidado, a exposição prolongada prejudica a audição.";
    }
}

// Loop que verifica a cada segundo se passou muito tempo sem dados
setInterval(() => {
    const timeSinceLastMessage = Date.now() - lastMessageTime;

    // Se passaram mais de X segundos e já recebemos alguma coisa antes ou se acabou de ligar
    if (timeSinceLastMessage > WATCHDOG_TIMEOUT_MS) {
        hardwareStatus.textContent = "Sem sinal...";
        hardwareStatus.className = "badge bg-danger";

        // Podemos adicionar um visual "cinzento" ao status se quisermos, 
        // para indicar perda de sinal. Mas mexer no badge já é nítido.
    }
}, 1000);

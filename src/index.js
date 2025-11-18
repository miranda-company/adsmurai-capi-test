//--------1

// Pedimos documento con las variables del proyecto
require('dotenv').config();

//--------2

// Axios es el "fetch" de Node.js
const axios = require('axios');

// Requerimos la librería csv-parse para parsear el CSV a objetos
const { parse } = require('csv-parse/sync');

// Almacenamos la URL del CSV, si no llega, mandamos error
const { CSV_URL } = process.env;

if (!CSV_URL) {
    console.error('Falta CSV_URL en el .env');
    process.exit(1);
}

// Meta nos pide que encriptemos la info del cliente. Usamos crypto
const crypto = require('crypto');

//--------3

// HELPERS

// Normalizamos la info como la pide Meta, hash genérico SHA-256 para strings (email, nombre, ciudad, etc.), luego encriptamos
function sha256(value) {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Normaliza números de teléfono (deja solo los dígitos)
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/[^\d]/g, '');
    return digits || null;
}

// Hash específico para teléfono
function hashPhone(phone) {
    const norm = normalizePhone(phone);
    if (!norm) return null;
    return crypto.createHash('sha256').update(norm).digest('hex');
}

// Parsea el valor de los precios
function parsePrice(raw) {
    if (!raw) return null;

    // 1) Buscar la primera secuencia de dígitos, puntos o comas
    const match = raw.match(/[\d.,]+/);
    if (!match) return null;

    let numStr = match[0]; // por ejemplo "15,00" o "1.234,50"

    // 2) Opcional: si usaran puntos para miles, se podrían quitar:
    //    "1.234,50" -> "1234,50"
    numStr = numStr.replace(/\./g, '');

    // 3) Cambiar coma decimal por punto: "1234,50" -> "1234.50"
    numStr = numStr.replace(',', '.');

    const value = Number(numStr);
    if (Number.isNaN(value)) return null;

    return value;
}

//--------4

// Esta función mapea los datos de las filas y las convierte a un evento tal y como espera Meta
function mapRowToEvent(row) {

    // 1) Checkout_time: convertir la fecha de la compra a timestamp unix (segundos)
    const purchaseTimeStr = row.Checkout_time;
    const timestampMs = purchaseTimeStr ? new Date(purchaseTimeStr).getTime() : NaN;

    if (Number.isNaN(timestampMs)) {
        console.warn('Fecha de compra inválida, se descarta fila:', purchaseTimeStr);
        return null;
    }

    const eventTime = Math.floor(timestampMs / 1000);

    // 2) Creamos un objeto y pasamos user_data con datos hasheados
    const userData = {};

    if (row.email) {
        const emHash = sha256(row.email);
        if (emHash) userData.email = [emHash];
    }

    if (row.phone) {
        const phHash = hashPhone(row.phone);
        if (phHash) userData.phone = [phHash];
    }

    if (row.madid) {
        const maHash = sha256(row.madid);
        if (maHash) userData.madid = [maHash];
    }

    if (row.Name) {
        const naHash = sha256(row.Name);
        if (naHash) userData.name = [naHash];
    }

    /*
        El nombre de ésta columna es "zip code" tiene un espacio. 
        Hay que guardar el string en una variable para poder usarla 
    */
    const zipCode = row['zip code'];
    if (zipCode) {
        const ziHash = sha256(zipCode);
        if (ziHash) userData.zipCode = [ziHash];
    }

    if (row.country) {
        const countryHash = sha256(row.country);
        if (countryHash) userData.country = [countryHash];
    }

    if (row.gender) {
        const geHash = sha256(row.gender);
        if (geHash) userData.gender = [geHash];
    }

    if (row.action) {
        const acHash = sha256(row.action);
        if (acHash) userData.action = [acHash];
    }

    // 3) custom_data con valor de la conversión (Price)
    /*
        Aquí hay que limpiar el string del valor del precio para quedarnos solo con el número.
        Tenemos que pasar el valor del precio por la función helper parsePrice()
    */
    const customData = {};
    const rawPrice = row['Price'];
    const parsedPrice = parsePrice(rawPrice);

    if (parsedPrice !== null) {
        customData.value = parsedPrice;
    }

    // Ya que el CSV no tiene columna de moneda, la inferimos.
    if (rawPrice && rawPrice.includes('$')) {
        customData.currency = 'USD';
    } else {
        customData.currency = 'EUR';
    }

    // 4) evento final que pasaremos a Meta
    const event = {
        event_name: 'Purchase',
        event_time: eventTime,
        action_source: 'physical_store', // importante para eventos offline
        user_data: userData,
        custom_data: customData
    };

    return event;
}



//--------5


// Función principal
async function main() {
    try {

        // Descarga CSV desde la URL
        console.log('Descargando CSV desde:', CSV_URL);
        const response = await axios.get(CSV_URL);
        const csvText = response.data;

        // Parsea CSV a objetos JS
        const records = parse(csvText, {
            columns: true, // usa la primera fila como nombres de propiedades (columnas)
            skip_empty_lines: true,
            trim: true
        });

        // ¿Cuántas filas contiene el CSV aparte de la primera fila?
        console.log(`Filas leídas: ${records.length}`);

        // Mostramos un ejemplo parseado de la primera fila como objeto
        console.log('Ejemplo de la primera fila como objeto:');
        console.log(records[0]);

        // ¿Cuáles son los nombres de las columnas (primera fila o fila 0)
        console.log('Nombres de las columnas:');
        console.log(Object.keys(records[0]));

        const firstRow = records[0];
        console.log('Primera fila del CSV:');
        console.log(firstRow);

        const firstEvent = mapRowToEvent(firstRow);
        console.log('Evento generado a partir de la primera fila:');
        console.dir(firstEvent, { depth: null });

    } catch (err) {
        console.error('Error:');
        console.error(err.message);
    }
}

// Ejecutamos main
main();
/*
global
    displayMessage,
    displayTopic,
    prompt,
    nameSanitize,
    sjcl,
    updateConfig
*/

var listeners = {};

var attributes = {
    rooms: [
        'main'
    ],
    activeRooms: [
        'main'
    ],
    nick: "nonick",
    domain: "seafour.club",
    keys: [],
};

var socket;

function emit(message) {
    socket.send(message.join("\u0004"));
}

function connect() {
    socket = new WebSocket('wss://' + attributes.domain);

    socket.onopen = function () {
        emit([ 'join', attributes.rooms[0] ]);
        emit([ 'giveRecent', attributes.rooms[0] ]);
        emit([ 'getPublicKey', 'server' ]);
        if (attributes.nick != "nonick") {
            emit([ 'createToken', attributes.nick ]);
        }
    };

    socket.onmessage = function(message) { // There has to be a more descriptive name than 'data' for this.
        var data = message.data.split("\u0004");
        if (! listeners[data[0]] ) { // Safety check, outputs a notice message to the console.
            console.log(
                "%cThe server has sent '" + data[0] + "', which is not defined as a listener.",
                "background-color: #DB9F9E; color: white;"
            );
            return false;
        }
        listeners[data[0]]( ...data.slice(1) );
    };

    socket.onerror = function () {
        console.log('error occurred!');
    };

    socket.onclose = function (event) {
        setTimeout(function() { connect(); }, 3000);
    };
}

/*
    LISTENER DEFINITIONS
*/

listeners["roomMessage"] = function(nick, post, id, flair, room) {
    displayMessage(nick, post, id, flair, room);
};

listeners["topic"] = function(topic, room) {
    displayTopic(topic);
};

listeners["systemMessage"] = function(content) {
    console.log(content); // To-do : Notify user using their phone's notification system.
};

listeners["nickRefresh"] = function(nick) {
    // To-do : This is currently useless in it's current iteration. 
    // Additionally, I probably should remove it from the server as well.
};

/*
    KEEP ALIVE
*/

setInterval(function() {
    emit(["ping"]);
}, 13000);

listeners["pong"] = function() {
    // I can do something with this later. Currently, useless.
};

/*
    AUTHENTICATE SYSTEM
*/

var ECDH = require('elliptic').ec;
var ec = new ECDH('curve25519');

listeners['publicKey'] = function(name, key) {
    if (name == 'server') {
        attributes.serverKey = ec.keyFromPublic(key, 'hex');
    }
    else {
        attributes.keys[name] = ec.keyFromPublic(key, 'hex');
    }
};

listeners['encryptedPrivateKey'] = function(name, encryptedPrivateKey) {
    try {
        var privateKey = sjcl.decrypt(
            attributes.pbkdf2DerivedKey,
            encryptedPrivateKey
        );
    }
    catch (err) {
        prompt.className = "authenticate";
    }

    attributes.keyPair = ec.keyFromPrivate(privateKey, 'hex');

    emit(['createToken', attributes.nick]);
};

listeners['cryptoToken'] = function(cryptoToken) {
    var sharedKey = attributes.keyPair.derive(
        attributes.serverKey.getPublic()
    ).toString(36);

    var token = sjcl.decrypt(
        sharedKey,
        cryptoToken
    );

    emit(['authenticate', attributes.nick, token, "main"]);

    updateConfig(attributes);
};

function login(nick, password) {
    attributes.nick = nick;

    // Generate pbkdf2 Derived Symmetric Encryption Key
    attributes.pbkdf2DerivedKey = sjcl.codec.base64.fromBits(
        sjcl.misc.pbkdf2(
            password, 
            nameSanitize(nick) + attributes.domain,     // There is no client-side way to derive a consistent, yet random salt, so we use username + domain.
            3500, 3000)
    );

    emit(['getEncryptedPrivateKey', attributes.nick]);
}

/*
    REGISTER SYSTEM
*/

function register(nick, password) {
    attributes.pbkdf2DerivedKey = sjcl.codec.base64.fromBits(
        sjcl.misc.pbkdf2(
            password,
            nameSanitize(nick) + attributes.domain,
            3500, 3000)
    );

    attributes.keyPair = ec.genKeyPair();

    emit(['register',
        nick,
        attributes.keyPair.getPublic('hex'),
        sjcl.encrypt(
            attributes.pbkdf2DerivedKey,
            attributes.keyPair.getPrivate('hex')
        )
    ]);

    updateConfig(attributes);
}
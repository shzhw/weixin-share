var express = require('express');
var https = require('https');
var swig = require('swig');
var bodyParser = require('body-parser');
var jsSHA = require('jssha');
var app = express();

const APPID = 'wx7896f29aad4743d0';
const APPSECRET = 'f152751b42628d80a07d047f2668409f';
const TOKEN = 'my_token_key';

app.engine('html', swig.renderFile);
app.set('views', './views');
app.set('view engine', 'html');
swig.setDefaults({ cache: false });
app.use('/public', express.static(__dirname + '/public'));

app.use(bodyParser.urlencoded({ extended: true }));

class WXSignCache {
  constructor(cnt) {
    this.time = new Date();
    this.cnt = cnt;
  }
}

var wxsign = null;

app.get('/sendurl', function(req, res) {
  if (wxsign) {
    if (new Date() - wxsign.time > 7200) {
      res.json(wxsign.cnt);
      return;
    }
  }
  getTicket().then(data => {
    var ticket = data.ticket;
    var nonceStr = createNonceStr();
    var timestamp = createTimeStamp();
    var url = decodeURIComponent(req.query.oriurl);
    var signature = calcSignature(ticket, nonceStr, timestamp, url);
    wxsign = new WXSignCache({ ticket, nonceStr, timestamp, signature, appid: APPID });
    res.json(wxsign.cnt);
  });
});

app.get('/wxtest', function(req, res) {
  var key = [TOKEN, req.query.timestamp, req.query.nonce].sort().join('');

  var shaObj = new jsSHA(key, 'TEXT');

  console.log(
    shaObj.getHash('SHA-1', 'HEX'),
    shaObj.getHash('SHA-1', 'HEX') === req.query.signature
  );
  res.end(req.query.echostr);
});

app.get('/', function(req, res) {
  res.render('index');
});

var server = app.listen(80, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('the app listening at http://localhost:80');
});

// noncestr
function createNonceStr() {
  return Math.random()
    .toString(36)
    .substr(2, 15);
}

// timestamp
function createTimeStamp() {
  return parseInt(new Date().getTime() / 1000) + '';
}

function getTicket() {
  return new Promise((resolve, reject) => {
    https.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`,
      res => {
        httpGETHandler(res).then(data => {
          resolve(JSON.parse(data));
        });
      }
    );
  }).then(data => {
    return new Promise((resolve, reject) => {
      https.get(
        `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${
          data.access_token
        }&type=jsapi`,
        res => {
          httpGETHandler(res).then(data => {
            resolve(JSON.parse(data));
          });
        }
      );
    });
  });
}

function httpGETHandler(res) {
  const { statusCode } = res;
  const contentType = res.headers['content-type'];

  let error;
  if (statusCode !== 200) {
    error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
  } else if (!/^application\/json/.test(contentType)) {
    error = new Error(
      'Invalid content-type.\n' +
        `Expected application/json but received ${contentType}`
    );
  }
  if (error) {
    console.error(error.message);
    // consume response data to free up memory
    res.resume();
    return;
  }

  res.setEncoding('utf8');
  let rawData = '';
  return new Promise((resolve, reject) => {
    res.on('data', chunk => {
      rawData += chunk;
    });
    res.on('end', () => {
      try {
        resolve(rawData);
      } catch (e) {
        reject(e.message);
      }
    });
  });
}

// 计算签名方法
function calcSignature(ticket, nonceStr, ts, url) {
  var ret = {
    jsapi_ticket: ticket,
    nonceStr,
    timestamp: ts,
    url
  };
  var string = raw(ret);
  var shaObj = new jsSHA(string, 'TEXT');
  return shaObj.getHash('SHA-1', 'HEX');
}

function raw(args) {
  var keys = Object.keys(args);
  keys = keys.sort();
  var newArgs = {};
  keys.forEach(function(key) {
    newArgs[key.toLowerCase()] = args[key];
  });

  var string = '';
  for (var k in newArgs) {
    string += '&' + k + '=' + newArgs[k];
  }
  string = string.substr(1);
  return string;
}

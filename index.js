const nodemw = require('nodemw');
const fetch = require('node-fetch');

const config = require('./config.json');

const resultMap = new Map(Object.entries(config.RESULT_MAP));
const indexPath = `${config.PROTOCOL}://${config.WIKI_DOMAIN}${config.API_PATH}index.php`;

const client = new nodemw({
    protocol: config.PROTOCOL,
    server: config.WIKI_DOMAIN,
    path: config.API_PATH,
    username: config.USERNAME,
    password: config.PASSWORD
});

client.logIn((err, user) => {
    if (err) throw err;
    if (user.result !== 'Success') throw new Error('Unable to login');

    console.log(`Logged in as ${user.lgusername}`);

    let enumerateAt = new Date("2021-08-30T04:13:09Z").getTime() / 1000;//Math.floor(Date.now() / 1000);

    setInterval(() => {
        client.api.call(
            {
                action: 'query',
                list: 'abuselog',
                afllimit: 15,
                aflprop: 'ids|filter|user|title|action|details|result|timestamp|hidden|revid',
                afldir: 'newer',
                aflstart: enumerateAt
            },
            (err, res) => {
                if (err) return console.info(err);

                const hits = res.abuselog;

                if (hits.length) {
                    enumerateAt = Math.floor(new Date(hits[hits.length - 1].timestamp).getTime() / 1000) + 1;
                    
                    hits.forEach(hit => {
                        let details = resultMap.get("DEFAULT");

                        resultMap.forEach((val, key) => {
                            if (hit.result.toLowerCase().indexOf(key.toLowerCase()) > -1) {
                                details = val;
                            }
                        });

                        let payload = {
                            embeds: [
                                {
                                    title: details.TITLE,
                                    color: Number(`0x${details.COLOR}`),
                                    description: `Hit on filter #${hit.filter_id} (${hit.filter})`,
                                    timestamp: hit.timestamp,
                                    fields: [
                                        {
                                            name: "User",
                                            value: `[${hit.user}](${indexPath}?title=User:${hit.user})`,
                                            inline: true
                                        },
                                        {
                                            name: "Page",
                                            value: `[${hit.title}](${indexPath}?title=${hit.title}) ${hit.revid ? ` ([diff](${indexPath}?title=Special:Diff/${hit.revid}))` : ''}`,
                                            inline: true
                                        },
                                        ...(hit.details.new_size ? {
                                            name: "Page Size",
                                            value: `${hit.details.old_size} > ${hit.details.new_size} **(${hit.details.new_size > hit.details.old_size ? '+' : '-'}${Math.abs(hit.details.new_size - hit.details.old_size)})**`,
                                            inline: true
                                        } : [])
                                    ]
                                }
                            ],
                            components: [
                                {
                                    "type": 1,
                                    "components": [
                                        {
                                            "type": 2,
                                            "label": "Details",
                                            "style": 5,
                                            "url": `${indexPath}?title=Special:AbuseLog/${hit.id}`
                                        },
                                        {
                                            "type": 2,
                                            "label": "Examine",
                                            "style": 5,
                                            "url": `${indexPath}?title=Special:AbuseFilter/examine/log/${hit.id}`
                                        }
                                    ]
                                }
                            ]
                        };

                        fetch(config.WEBHOOK_URL, {
                            method: 'post',
                            body: JSON.stringify(payload),
                            headers: { 'Content-Type': 'application/json' }
                        }).then(res => {
                            if (!res.ok) console.info(res);
                        }).catch(console.info);
                    })
                } else {
                    enumerateAt = Math.floor(Date.now() / 1000);
                }
            }
        )
    }, config.POLL_INTERVAL);
});
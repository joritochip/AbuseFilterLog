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

    let filterTimestamp = Math.floor(Date.now() / 1000);

    setInterval(() => {
        client.api.call(
            {
                action: 'query',
                list: 'abuselog',
                afllimit: 15,
                aflprop: 'ids|filter|user|title|action|details|result|timestamp|hidden|revid',
                afldir: 'newer',
                aflstart: filterTimestamp
            },
            (err, res) => {
                if (err) return console.info(err);

                const hits = res.abuselog;

                if (hits.length) {
                    filterTimestamp = Math.floor(new Date(hits[hits.length - 1].timestamp).getTime() / 1000) + 1;
                    
                    hits.forEach(hit => {
                        const { filter_id, filter, timestamp, user, title, revid, id } = hit;
                        const { old_size, new_size } = hit.details;

                        let details = resultMap.get("DEFAULT");

                        resultMap.forEach((val, key) => {
                            if (hit.result.toLowerCase().indexOf(key.toLowerCase()) > -1) {
                                details = val;
                            }
                        });

                        const payload = {
                            embeds: [
                                {
                                    title: details.TITLE,
                                    color: Number(`0x${details.COLOR}`),
                                    description: `Hit on filter #${filter_id} (${filter})`,
                                    timestamp: timestamp,
                                    fields: [
                                        {
                                            name: "User",
                                            value: `[${user}](${indexPath}?title=User:${user.replace(/ /g, '_')})`,
                                            inline: true
                                        },
                                        {
                                            name: "Page",
                                            value: `[${title}](${indexPath}?title=${title.replace(/ /g, '_')}) ${revid ? ` ([diff](${indexPath}?title=Special:Diff/${revid}))` : ''}`,
                                            inline: true
                                        },
                                        ...(new_size ? [{
                                            name: "Page Size",
                                            value: `${old_size} -> ${new_size} **(${Number(new_size) > Number(old_size) ? '+' : ''}${Number(new_size) - Number(old_size)})**`,
                                            inline: true
                                        }] : [])
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
                                            "url": `${indexPath}?title=Special:AbuseLog/${id}`
                                        },
                                        {
                                            "type": 2,
                                            "label": "Examine",
                                            "style": 5,
                                            "url": `${indexPath}?title=Special:AbuseFilter/examine/log/${id}`
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
                    filterTimestamp = Math.floor(Date.now() / 1000);
                }
            }
        )
    }, config.POLL_INTERVAL);
});
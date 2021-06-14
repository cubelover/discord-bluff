import { AxiosResponse } from 'axios';
import WebSocket from 'ws';
import bot from 'src/bot';
import config from 'src/config';
import instance from 'src/instance';

let discord: WebSocket;

const send = (channelId: string, content: string): Promise<AxiosResponse<unknown>> =>
  instance.post(`https://discord.com/api/v8/channels/${channelId}/messages`, { content });

const start = () => {
  let alive = true;
  let last_s: number | null = null;
  let ping: NodeJS.Timeout;
  discord = new WebSocket('wss://gateway.discord.gg/?v=8&encoding=json');
  discord.on('message', (data) => {
    try {
      const { op, d, s, t } = JSON.parse(data.toString()) as {
        op: number;
        d: unknown;
        s: number | null;
        t: string | null;
      };
      last_s = s;
      if (op === 0) {
        if (t === 'GUILD_CREATE')
          bot.signal.guildCreate(
            d as {
              id: string;
              members: { user: { id: string; username: string }; nick?: string }[];
            },
          );
        if (t === 'GUILD_MEMBER_UPDATE') {
          const {
            guild_id,
            user: { id, username },
            nick,
          } = d as { guild_id: string; user: { id: string; username: string }; nick?: string };
          bot.signal.guildMemberUpdate(guild_id, id, nick || username);
        }
        if (t === 'MESSAGE_CREATE') {
          const {
            content,
            guild_id,
            channel_id,
            author: { id, username },
            member: { nick },
          } = d as {
            content: string;
            guild_id: string;
            channel_id: string;
            author: { id: string; username: string };
            member: { nick?: string };
          };
          if (content[0] === '!') {
            bot.signal.guildMemberUpdate(guild_id, id, nick || username);
            void bot.run(send, guild_id, channel_id, id, content.split(/\s+/));
          }
        }
      }
      if (op === 10) {
        ping = setInterval(() => {
          if (!alive) {
            discord.terminate();
            return;
          }
          alive = false;
          discord.send(JSON.stringify({ op: 1, d: last_s }));
        }, (d as { heartbeat_interval: number }).heartbeat_interval);
        discord.send(
          JSON.stringify({
            op: 2,
            d: {
              token: config.token,
              intents: 515,
              properties: {
                $os: 'linux',
                $browser: 'my_library',
                $device: 'my_library',
              },
            },
          }),
        );
      }
      if (op === 11) alive = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err, data);
    }
  });
  discord.on('close', () => {
    clearInterval(ping);
    setTimeout(start, 5000);
  });
};

start();

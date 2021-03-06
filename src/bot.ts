import crypto from 'crypto';
import instance from 'src/instance';

type Send = (channelId: string, content: string) => Promise<unknown>;

const db: {
  [id: string]: [
    { [id: string]: string },
    [number, [string, number][], { [id: string]: number[] }, [string, number, number, number]],
  ];
} = {};
const dm: { [id: string]: string } = {};

const DM = async (send: Send, who: string, what: string) => {
  if (!(who in dm)) {
    const { data } = await instance.post<{ id: string }>(
      'https://discord.com/api/v8/users/@me/channels',
      {
        recipient_id: who,
      },
    );
    dm[who] = data.id;
  }
  return send(dm[who], what);
};

const emojify = (n: number) => [':one:', ':two:', ':three:', ':four:', ':five:', ':star:'][n - 1];

const random = (n: number) => {
  const m = Math.floor(256 / n);
  for (;;) {
    const t = Math.floor(crypto.randomBytes(1)[0] / m);
    if (t < n) return t;
  }
};

const bluffRound = (send: Send, guildId: string, channelId: string) => {
  const [users, bluff] = db[guildId];
  bluff[1] = bluff[1].filter(([, y]) => y > 0);
  if (bluff[1].length < 2) {
    void send(channelId, `승자: <@${bluff[1][0][0]}>`);
    bluff[0] = 0;
    bluff[1] = [];
    return;
  }
  bluff[2] = {};
  for (const [x, y] of bluff[1]) {
    const d: number[] = [];
    for (let i = 0; i < y; i += 1) d.push(random(6) + 1);
    d.sort();
    bluff[2][x] = d;
    void DM(send, x, d.map(emojify).join(' '));
  }
  bluff[3][3] = +new Date();
  void send(
    channelId,
    `라운드 시작! <@${bluff[1][0][0]}>의 차례 (${bluff[1]
      .map(([x, y]) => `${users[x]}: ${y}`)
      .join(', ')}, 총 ${bluff[1].reduce((s, [, t]) => s + t, 0)}개)`,
  );
};

export default {
  signal: {
    guildCreate: ({
      id,
      members,
    }: {
      id: string;
      members: { user: { id: string; username: string }; nick?: string }[];
    }): void => {
      if (!(id in db)) db[id] = [{}, [0, [], {}, ['', 0, 0, 0]]];
      for (const { user, nick } of members) db[id][0][user.id] = nick || user.username;
    },
    guildMemberUpdate: (guildId: string, id: string, nick: string): void => {
      db[guildId][0][id] = nick;
    },
  },
  run: async (
    send: Send,
    guildId: string,
    channelId: string,
    authorId: string,
    args: string[],
  ): Promise<void> => {
    const [users, [state, pp, dice, last]] = db[guildId];
    if (args[0] === '!join') {
      if (state || pp.some(([x]) => x === authorId)) return;
      pp.push([authorId, 5]);
      void send(channelId, `현재 ${pp.length}명 (${pp.map(([e]) => users[e]).join(', ')})`);
    }
    if (args[0] === '!start') {
      if (state || pp.every(([x]) => x !== authorId)) return;
      for (let i = 1; i < pp.length; i += 1) {
        const j = random(i + 1);
        const t = pp[i];
        pp[i] = pp[j];
        pp[j] = t;
      }
      db[guildId][1][0] = 1;
      bluffRound(send, guildId, channelId);
    }
    if (args[0] === '!bet') {
      if (!state || authorId !== pp[0][0] || args.length < 3) return;
      const x = Math.floor(+args[1]);
      const y = Math.floor(+args[2]);
      if (!(x >= 1 && x <= 6 && y >= 1)) return;
      const [, tx, ty] = last;
      if ((x === 6 ? y + y - 1 : y) * 10 + x <= (tx === 6 ? ty + ty - 1 : ty) * 10 + tx) return;
      pp.push(pp.shift() ?? ['', 0]);
      last[0] = authorId;
      last[1] = x;
      last[2] = y;
      last[3] = +new Date();
      void send(
        channelId,
        `${users[authorId]}의 베팅: ${emojify(x)}${'이가'[(52 >> x) & 1]} ${y}개, <@${
          pp[0][0]
        }>의 차례`,
      );
    }
    if (args[0] === '!bluff') {
      if (!state || authorId !== pp[0][0] || !last[0]) return;
      const [tw, tx, ty] = last;
      last[0] = '';
      last[1] = 0;
      last[2] = 0;
      const cnt = Object.values(dice).reduce(
        (s, e) => e.reduce((ss, t) => ss + +(t === 6 || t === tx), s),
        0,
      );
      if (ty < cnt) (pp.find(([e]) => e === authorId) as [string, number])[1] -= cnt - ty;
      else if (ty > cnt) (pp.find(([e]) => e === tw) as [string, number])[1] -= ty - cnt;
      else
        pp.forEach((e) => {
          if (e[0] !== tw) e[1] -= 1;
        });
      await send(
        channelId,
        `${users[authorId]}의 도전: ${emojify(tx)}${'이가'[(52 >> tx) & 1]} ${cnt}개 (차이: ${
          ty - cnt
        })\n${pp.map(([e]) => `${users[e]}: ${dice[e].map(emojify).join(' ')}`).join('\n')}`,
      );
      bluffRound(send, guildId, channelId);
    }
    if (args[0] === '!reset') {
      const diff = 600 - (+new Date() - last[3]) / 1000;
      if (diff > 0)
        void send(
          channelId,
          `${Math.floor(diff / 60)}분 ${Math.floor(diff % 60)}초 후에 사용 가능`,
        );
      else {
        db[guildId][1][0] = 0;
        db[guildId][1][1] = [];
        void send(channelId, '초기화 완료');
      }
    }
  },
};

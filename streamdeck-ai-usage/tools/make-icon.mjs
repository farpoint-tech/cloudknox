// Generates the 256/512 px PNG plugin icon (the manifest's plugin Icon must be PNG). No native deps.
import fs from "node:fs";
import zlib from "node:zlib";

function crc32(buf) {
	let c, crc = 0xffffffff;
	for (const b of buf) {
		c = (crc ^ b) & 0xff;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crc = (crc >>> 8) ^ c;
	}
	return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		for (let x = 0; x < size; x++) raw.set(pixel(x / size, y / size), y * (size * 4 + 1) + 1 + x * 4);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// Rounded dark tile with three usage bars (green, amber, red) of rising height.
const bars = [
	{ x0: 0.2, x1: 0.34, top: 0.55, c: [0x30, 0xa4, 0x6c] },
	{ x0: 0.43, x1: 0.57, top: 0.38, c: [0xf5, 0xa5, 0x24] },
	{ x0: 0.66, x1: 0.8, top: 0.2, c: [0xe5, 0x48, 0x4d] },
];
function pixel(u, v) {
	const r = 0.14;
	const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
	if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
	for (const b of bars) if (u >= b.x0 && u <= b.x1 && v >= b.top && v <= 0.8) return [...b.c, 255];
	return [0x11, 0x11, 0x11, 255];
}
const out = process.argv[2] ?? "tech.farpoint.ai-usage.sdPlugin/imgs/plugin";
fs.writeFileSync(`${out}/icon.png`, png(256, pixel));
fs.writeFileSync(`${out}/icon@2x.png`, png(512, pixel));
console.log("icons written");

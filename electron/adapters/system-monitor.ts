import os from 'os';

export interface SystemSnapshot {
  data: SystemMonitorData;
  timestamp: string;
}

export interface SystemMonitorData {
  cpu: {
    usage: number; // 0-100
    cores: number;
    model: string;
    speed: number; // GHz
    perCore: number[]; // usage per core 0-100
  };
  memory: {
    total: number; // bytes
    used: number;
    free: number;
    usagePercent: number;
  };
  uptime: number; // seconds
  loadAvg: [number, number, number]; // 1, 5, 15 min
  hostname: string;
  platform: string;
  arch: string;
}

// Store previous CPU times to calculate delta usage
let prevCpuTimes: { idle: number; total: number }[] = [];

function getCpuUsage(): { total: number; perCore: number[] } {
  const cpus = os.cpus();
  const perCore: number[] = [];
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu, i) => {
    const times = cpu.times;
    const idle = times.idle;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;

    if (prevCpuTimes[i]) {
      const idleDelta = idle - prevCpuTimes[i].idle;
      const totalDelta = total - prevCpuTimes[i].total;
      const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
      perCore.push(Math.max(0, Math.min(100, usage)));
    } else {
      perCore.push(0);
    }

    totalIdle += idle;
    totalTick += total;
  });

  // Update previous times
  prevCpuTimes = cpus.map((cpu) => {
    const times = cpu.times;
    return {
      idle: times.idle,
      total: times.user + times.nice + times.sys + times.idle + times.irq,
    };
  });

  // Overall average
  const avgUsage = perCore.length > 0
    ? Math.round(perCore.reduce((a, b) => a + b, 0) / perCore.length)
    : 0;

  return { total: avgUsage, perCore };
}

export const systemMonitorAdapter = {
  name: 'system',

  isConfigured(): boolean {
    return true; // always available — no token needed
  },

  async fetchSnapshot(): Promise<SystemSnapshot> {
    const cpus = os.cpus();
    const cpuUsage = getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const data: SystemMonitorData = {
      cpu: {
        usage: cpuUsage.total,
        cores: cpus.length,
        model: cpus[0]?.model?.trim() || 'Unknown',
        speed: cpus[0]?.speed ? cpus[0].speed / 1000 : 0, // MHz to GHz
        perCore: cpuUsage.perCore,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      uptime: os.uptime(),
      loadAvg: os.loadavg() as [number, number, number],
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    };

    return {
      data,
      timestamp: new Date().toISOString(),
    };
  },
};

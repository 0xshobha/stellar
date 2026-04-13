'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StreamEvent } from '../lib/types';

interface TopologyGraphProps {
  events: StreamEvent[];
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'user' | 'manager' | 'worker' | 'subagent';
  totalReceived: number;
  lastPaidAt: number;
  maxDepth: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'primary' | 'recursive';
  amount: number;
}

interface FlowPacket {
  id: string;
  linkId: string;
  kind: 'primary' | 'recursive';
}

export default function TopologyGraph({ events }: TopologyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const seenEventsRef = useRef(0);
  const [pulseNow, setPulseNow] = useState(() => Date.now());
  const [packets, setPackets] = useState<FlowPacket[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setPulseNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const normalizeNode = (name: string): string => (name === 'ManagerAgent' ? 'Manager' : name);
    const nextPackets: FlowPacket[] = [];

    for (let i = seenEventsRef.current; i < events.length; i += 1) {
      const event = events[i];
      const isPrimaryPaid = event.type === 'paid';
      const isRecursivePaid = event.type === 'recursive-paid';
      if (!isPrimaryPaid && !isRecursivePaid) continue;
      const agent = typeof event.agent === 'string' ? event.agent : null;
      if (!agent) continue;
      const sourceRaw =
        isRecursivePaid && typeof event.parentAgent === 'string'
          ? event.parentAgent
          : typeof event.source === 'string'
            ? event.source
            : 'Manager';
      nextPackets.push({
        id: `${event.type}-${agent}-${Date.now()}-${i}`,
        linkId: `${isRecursivePaid ? 'recursive' : 'primary'}-${normalizeNode(sourceRaw)}-${normalizeNode(agent)}-${i}`,
        kind: isRecursivePaid ? 'recursive' : 'primary'
      });
    }

    seenEventsRef.current = events.length;
    if (nextPackets.length === 0) return;

    setPackets((prev) => [...prev, ...nextPackets]);
    const timer = setTimeout(() => {
      setPackets((prev) => prev.filter((packet) => !nextPackets.some((p) => p.id === packet.id)));
    }, 700);
    return () => clearTimeout(timer);
  }, [events]);

  const graph = useMemo(() => {
    const nodes = new Map<string, GraphNode>([
      ['User', { id: 'User', type: 'user', totalReceived: 0, lastPaidAt: 0, maxDepth: 0 }],
      ['Manager', { id: 'Manager', type: 'manager', totalReceived: 0, lastPaidAt: 0, maxDepth: 0 }]
    ]);

    const links: GraphLink[] = [{ id: 'user-manager', source: 'User', target: 'Manager', kind: 'primary', amount: 0 }];

    const normalizeNode = (name: string): string => {
      if (name === 'ManagerAgent') return 'Manager';
      return name;
    };

    const ensureNode = (id: string, type: GraphNode['type']) => {
      if (!nodes.has(id)) {
        nodes.set(id, { id, type, totalReceived: 0, lastPaidAt: 0, maxDepth: 0 });
        return;
      }

      const current = nodes.get(id);
      if (!current) return;

      if (type === 'subagent' && current.type === 'worker') {
        current.type = 'subagent';
      }
    };

    events.forEach((event, index) => {
      const isPrimaryPaid = event.type === 'paid';
      const isRecursivePaid = event.type === 'recursive-paid';
      const isHiringEvent = event.type === 'hiring' || event.type === 'step-start';
      if (!isPrimaryPaid && !isRecursivePaid && !isHiringEvent) return;

      const agent = typeof event.agent === 'string' ? event.agent : null;
      if (!agent) return;

      const eventAt = typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) ? Date.parse(event.at) : pulseNow + index;
      const amount = Number(event.amount ?? event.pricePaid ?? event.price ?? 0);
      const depth = Number(event.depth);

      if (isRecursivePaid) {
        ensureNode(agent, 'subagent');
      } else {
        ensureNode(agent, 'worker');
      }

      const sourceRaw =
        isRecursivePaid && typeof event.parentAgent === 'string'
          ? event.parentAgent
          : typeof event.source === 'string'
            ? event.source
            : 'Manager';
      const source = normalizeNode(sourceRaw);

      if (source === 'User') {
        ensureNode(source, 'user');
      } else if (source === 'Manager') {
        ensureNode(source, 'manager');
      } else {
        ensureNode(source, 'worker');
      }

      if (isPrimaryPaid || isRecursivePaid) {
        const targetNode = nodes.get(agent);
        if (targetNode) {
          targetNode.totalReceived = Number((targetNode.totalReceived + amount).toFixed(6));
          targetNode.lastPaidAt = eventAt;
          targetNode.maxDepth = Math.max(targetNode.maxDepth, Number.isFinite(depth) ? depth : 0);
        }

        const sourceNode = nodes.get(source);
        if (sourceNode) {
          sourceNode.maxDepth = Math.max(sourceNode.maxDepth, Number.isFinite(depth) ? depth : 0);
        }

        links.push({
          id: `${isRecursivePaid ? 'recursive' : 'primary'}-${source}-${agent}-${index}`,
          source,
          target: agent,
          kind: isRecursivePaid ? 'recursive' : 'primary',
          amount
        });
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      links
    };
  }, [events, pulseNow]);

  const stats = useMemo(() => {
    let totalPaid = 0;
    let recursiveCalls = 0;
    let maxDepth = 0;
    const active = new Set<string>();

    events.forEach((event) => {
      if (event.type !== 'paid' && event.type !== 'recursive-paid') return;
      const amount = Number(event.amount ?? event.pricePaid ?? event.price ?? 0);
      if (Number.isFinite(amount)) totalPaid += amount;
      if (event.type === 'recursive-paid') recursiveCalls += 1;
      if (typeof event.agent === 'string') active.add(event.agent);
      const depth = Number(event.depth);
      if (Number.isFinite(depth)) maxDepth = Math.max(maxDepth, depth);
    });

    return {
      totalPaid: Number(totalPaid.toFixed(3)),
      activeAgents: active.size,
      recursiveCalls,
      maxDepth
    };
  }, [events]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 620;
    const height = 360;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');

    const arrowIds = [
      { id: 'arrow-primary', color: '#16a34a' },
      { id: 'arrow-recursive', color: '#f59e0b' }
    ];

    arrowIds.forEach((marker) => {
      defs
      .append('marker')
      .attr('id', marker.id)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', marker.color);
    });

    const workers = graph.nodes.filter((node) => node.type === 'worker');
    const subAgents = graph.nodes.filter((node) => node.type === 'subagent');

    const manager = graph.nodes.find((node) => node.id === 'Manager');
    if (manager) {
      manager.fx = width / 2;
      manager.fy = height / 2;
      manager.x = width / 2;
      manager.y = height / 2;
    }

    const user = graph.nodes.find((node) => node.id === 'User');
    if (user) {
      user.fx = 90;
      user.fy = 55;
      user.x = 90;
      user.y = 55;
    }

    workers.forEach((worker, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, workers.length);
      worker.x = width / 2 + Math.cos(angle) * 160;
      worker.y = height / 2 + Math.sin(angle) * 120;
    });

    subAgents.forEach((subAgent, index) => {
      const spacing = width / (subAgents.length + 1);
      subAgent.x = spacing * (index + 1);
      subAgent.y = height - 60;
    });

    const simulation = d3
      .forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links).id((d) => (d as GraphNode).id).distance((d) => (d.kind === 'recursive' ? 95 : 120)))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX<GraphNode>((node) => {
        if (node.type === 'user') return 90;
        if (node.type === 'manager') return width / 2;
        if (node.type === 'subagent') return node.x ?? width / 2;
        return width / 2;
      }).strength(0.16))
      .force('y', d3.forceY<GraphNode>((node) => {
        if (node.type === 'user') return 55;
        if (node.type === 'manager') return height / 2;
        if (node.type === 'subagent') return height - 60;
        return height / 2 + 15;
      }).strength(0.2))
      .force('collide', d3.forceCollide(26));

    const positiveAmounts = graph.links.map((item) => item.amount).filter((amount) => amount > 0);
    const minAmount = positiveAmounts.length > 0 ? Math.min(...positiveAmounts) : 0.001;
    const maxAmount = positiveAmounts.length > 0 ? Math.max(...positiveAmounts) : minAmount;
    const strokeScale = d3.scaleLog().domain([minAmount, maxAmount === minAmount ? minAmount * 1.01 : maxAmount]).range([1.5, 5]);

    const link = svg
      .append('g')
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('stroke', (d) => (d.kind === 'recursive' ? '#f59e0b' : '#16a34a'))
      .attr('stroke-width', (d) => {
        if (d.amount <= 0) return 1.5;
        return Number(strokeScale(d.amount).toFixed(2));
      })
      .attr('fill', 'none')
      .attr('stroke-dasharray', (d) => (d.kind === 'recursive' ? '6,4' : '0'))
      .attr('marker-end', (d) => (d.kind === 'recursive' ? 'url(#arrow-recursive)' : 'url(#arrow-primary)'));

    link.attr('id', (d) => `link-${d.id}`);

    svg
      .append('g')
      .attr('class', 'packet-layer')
      .selectAll('circle')
      .data(packets)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', (d) => (d.kind === 'recursive' ? '#f59e0b' : '#10b981'))
      .attr('opacity', 0.95)
      .append('animateMotion')
      .attr('dur', '600ms')
      .attr('repeatCount', '1')
      .attr('fill', 'freeze')
      .append('mpath')
      .attr('href', (d) => `#link-${d.linkId}`);

    const edgeLabels = svg
      .append('g')
      .selectAll('text')
      .data(graph.links.filter((item) => item.amount > 0))
      .enter()
      .append('text')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', '#334155')
      .attr('text-anchor', 'middle')
      .text((d) => `${d.amount.toFixed(3)} USDC`);

    const node = svg
      .append('g')
      .selectAll('g')
      .data(graph.nodes)
      .enter()
      .append('g')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append('g')
      .attr('class', 'node-rings')
      .selectAll('circle')
      .data([0, 1, 2])
      .enter()
      .append('circle')
      .attr('class', (d) => `pulse-ring ring-${d + 1}`)
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', '#60a5fa')
      .attr('stroke-width', 2);

    node
      .append('circle')
      .attr('r', (d) => (d.type === 'manager' ? 20 : 16))
      .attr('fill', (d) => {
        if (d.type === 'user') return '#94a3b8';
        if (pulseNow - d.lastPaidAt <= 3000) return '#2563eb';
        return '#64748b';
      })
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.2);

    node
      .append('circle')
      .attr('class', 'subagent-ring')
      .attr('r', 20)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 1.8)
      .attr('stroke-dasharray', '4,2')
      .style('display', (d) => (d.type === 'subagent' ? 'block' : 'none'));

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 33)
      .attr('fill', '#334155')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text((d) => d.id);

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 47)
      .attr('fill', '#475569')
      .attr('font-size', 10)
      .text((d) => `${d.totalReceived.toFixed(3)} USDC`);

    node
      .append('text')
      .attr('class', 'depth-pill')
      .attr('text-anchor', 'middle')
      .attr('dy', -24)
      .attr('font-size', 9)
      .attr('font-weight', 700)
      .attr('fill', '#0f172a')
      .text((d) => `d${d.maxDepth}`);

    const legend = svg.append('g').attr('transform', `translate(${width - 215}, 12)`);
    legend
      .append('rect')
      .attr('width', 205)
      .attr('height', 108)
      .attr('rx', 10)
      .attr('fill', '#ffffff')
      .attr('stroke', '#cbd5e1');

    legend.append('text').attr('x', 10).attr('y', 18).attr('font-size', 11).attr('font-weight', 700).attr('fill', '#0f172a').text('Legend');

    legend.append('line').attr('x1', 10).attr('y1', 34).attr('x2', 50).attr('y2', 34).attr('stroke', '#16a34a').attr('stroke-width', 2.2);
    legend.append('text').attr('x', 58).attr('y', 37).attr('font-size', 10).attr('fill', '#334155').text('Green solid arrow = Manager → Worker payment');

    legend
      .append('line')
      .attr('x1', 10)
      .attr('y1', 52)
      .attr('x2', 50)
      .attr('y2', 52)
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', '6,4');
    legend.append('text').attr('x', 58).attr('y', 55).attr('font-size', 10).attr('fill', '#334155').text('Orange dashed arrow = Worker → Sub-agent (recursive)');

    legend.append('circle').attr('cx', 16).attr('cy', 70).attr('r', 6).attr('fill', '#64748b');
    legend.append('text').attr('x', 28).attr('y', 73).attr('font-size', 10).attr('fill', '#334155').text('Grey node = idle');

    legend.append('circle').attr('cx', 16).attr('cy', 88).attr('r', 6).attr('fill', '#2563eb');
    legend.append('text').attr('x', 28).attr('y', 91).attr('font-size', 10).attr('fill', '#334155').text('Blue pulsing node = just paid');

    simulation.on('tick', () => {
      link
        .attr('d', (d) => {
          const sx = (d.source as GraphNode).x ?? 0;
          const sy = (d.source as GraphNode).y ?? 0;
          const tx = (d.target as GraphNode).x ?? 0;
          const ty = (d.target as GraphNode).y ?? 0;
          return `M${sx},${sy} L${tx},${ty}`;
        });

      edgeLabels
        .attr('x', (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr('y', (d) => ((((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2) - 6);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      node.classed('node-pulse', (d) => pulseNow - d.lastPaidAt <= 3000);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, packets, pulseNow, events.length]);

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Topology</h2>
      <p className="mt-1 text-xs text-slate-500">Session payment topology with recursive sub-agent flows and per-node USDC totals.</p>
      <svg className="mt-3 w-full rounded-xl border border-slate-200 bg-white shadow-inner" ref={svgRef} viewBox="0 0 620 360" />
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="glass-chip">Total USDC paid: {stats.totalPaid.toFixed(3)}</span>
        <span className="glass-chip">Active agents: {stats.activeAgents}</span>
        <span className="glass-chip">
          Recursive calls: {stats.recursiveCalls} | Max depth: d{stats.maxDepth}
        </span>
      </div>
      <style jsx>{`
        .glass-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(241, 245, 249, 0.78));
          padding: 0.3rem 0.62rem;
          font-size: 0.72rem;
          font-weight: 600;
          color: #334155;
          backdrop-filter: blur(4px);
        }

        :global(.node-rings) {
          display: none;
        }
        :global(.node-pulse .node-rings) {
          display: block;
        }
        :global(.pulse-ring) {
          opacity: 0;
          transform-origin: center;
          animation: nodePulse 1.2s ease-out infinite;
        }
        :global(.ring-1) {
          animation-delay: 0ms;
        }
        :global(.ring-2) {
          animation-delay: 300ms;
        }
        :global(.ring-3) {
          animation-delay: 600ms;
        }

        @keyframes nodePulse {
          0% {
            r: 16;
            opacity: 0.7;
          }
          100% {
            r: 34;
            opacity: 0;
          }
        }
      `}</style>
    </section>
  );
}

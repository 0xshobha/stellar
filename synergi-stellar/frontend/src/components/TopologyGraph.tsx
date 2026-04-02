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
  pulse: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'primary' | 'recursive';
  amount: number;
}

export default function TopologyGraph({ events }: TopologyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pulseNow, setPulseNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setPulseNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const graph = useMemo(() => {
    const nodes = new Map<string, GraphNode>([
      ['User', { id: 'User', type: 'user', totalReceived: 0, lastPaidAt: 0, pulse: false }],
      ['Manager', { id: 'Manager', type: 'manager', totalReceived: 0, lastPaidAt: 0, pulse: false }]
    ]);

    const links: GraphLink[] = [{ id: 'user-manager', source: 'User', target: 'Manager', kind: 'primary', amount: 0 }];

    const normalizeNode = (name: string): string => {
      if (name === 'ManagerAgent') return 'Manager';
      return name;
    };

    const ensureNode = (id: string, type: GraphNode['type']) => {
      if (!nodes.has(id)) {
        nodes.set(id, { id, type, totalReceived: 0, lastPaidAt: 0, pulse: false });
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

    nodes.forEach((node) => {
      node.pulse = pulseNow - node.lastPaidAt <= 2000;
    });

    return {
      nodes: Array.from(nodes.values()),
      links
    };
  }, [events, pulseNow]);

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

    const link = svg
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke', (d) => (d.kind === 'recursive' ? '#f59e0b' : '#16a34a'))
      .attr('stroke-width', 2.2)
      .attr('stroke-dasharray', (d) => (d.kind === 'recursive' ? '6,4' : '0'))
      .attr('marker-end', (d) => (d.kind === 'recursive' ? 'url(#arrow-recursive)' : 'url(#arrow-primary)'));

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
      .append('circle')
      .attr('r', (d) => (d.type === 'manager' ? 20 : 16))
      .attr('fill', (d) => {
        if (d.type === 'user') return '#94a3b8';
        if (d.pulse) return '#2563eb';
        return '#64748b';
      })
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.2);

    node
      .filter((d) => d.pulse)
      .append('circle')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('opacity', 0.75)
      .transition()
      .duration(900)
      .attr('r', 26)
      .attr('opacity', 0.1);

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
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      edgeLabels
        .attr('x', (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr('y', (d) => ((((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2) - 6);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph]);

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Topology</h2>
      <p className="mt-1 text-xs text-slate-500">Session payment topology with recursive sub-agent flows and per-node USDC totals.</p>
      <svg className="mt-3 w-full rounded-xl border border-slate-200 bg-white shadow-inner" ref={svgRef} viewBox="0 0 620 360" />
    </section>
  );
}

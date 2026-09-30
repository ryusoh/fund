---
---

{% raw %}

# AI Data Center Networking – Industry Thesis

- **Domain**: Cloud & AI Data Center Interconnect Infrastructure
- **Related Portfolios**: ANET (Arista Networks), GOOG (Google Cloud / TPU Infrastructure)
- **As of Date**: 2026-09-30
- **Time Horizon**: 3–7 Years
- **Key Standards**: IEEE 802.3, Ultra Ethernet Consortium (UEC), RoCEv2, PCIe Gen 6/7

---

## 1. Industry Executive Summary

AI infrastructure is transitioning from compute-bound scaling to communication-bound scaling. As large language models and multi-modal foundation models scale from tens of billions to trillions of parameters, training and inference clusters expand from hundreds of GPUs/TPUs to 32,000, 100,000, and eventually 1,000,000 accelerator nodes. At this scale, the network fabric is no longer peripheral data-center plumbing; it is the computer's backplane.

The industry is defined by two interlocking structural dynamics:

1. **The Ethernet vs. InfiniBand Architectural Battle**: Hyperscalers (Meta, Microsoft, Google) reject closed, single-vendor proprietary fabrics (Nvidia InfiniBand) in favor of high-performance, open Ethernet enhanced with RoCEv2 and Ultra Ethernet Consortium (UEC) standards.
2. **Optics & Bandwidth Density Migration**: Rapid port-speed transition from 400G to 800G and 1.6T, accompanied by physical-layer disruption across DSP-based optical transceivers, Linear Pluggable Optics (LPO), and Co-Packaged Optics (CPO).

---

## 2. Value Chain & Competitive Landscape

```text
+-----------------------------------------------------------------------------------+
|                              SILICON LAYER                                        |
| Broadcom (Tomahawk 5/6, Jericho 3AI) · Marvell (Teralynx) · Nvidia (Spectrum-4/X) |
+------------------------------------+----------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------------+
|                       SYSTEMS & NETWORK OS LAYER                              |
|  Arista Networks (EOS, NetDL) · Cisco (Silicon One/Nexus) · Celestica/Accton  |
|                     Open-Source NOS: SONiC (Linux Foundation)                 |
+------------------------------------+------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------+
|                       OPTICAL & INTERCONNECT LAYER                      |
| InnoLight · Coherent · Lumentum · Broadcom (Optics) · Corning (PM Fiber)|
+------------------------------------+------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------+
|                        DEPLOYMENT & CONSUMPTION                         |
| Cloud Titans: Meta, Microsoft Azure, Google Cloud (Jupiter/TPU), AWS    |
| Neoclouds / GPU Clouds: CoreWeave, Lambda Labs, Crusoe, Crusoe Cloud    |
+-------------------------------------------------------------------------+
```

### 2.1 Silicon Layer

- **Merchant Silicon Dominance**: Broadcom maintains leadership in high-radix switching silicon with Tomahawk 5 (51.2 Tbps, 64x800G) and Jericho 3AI (deep buffers, VOQ, cell-based fabric). Tomahawk 6 (102.4 Tbps) sets the benchmark for 1.6T generation.
- **Nvidia Spectrum-X**: Nvidia is aggressively pushing its own merchant/semi-custom Ethernet silicon, bundling Spectrum-X switches with BlueField-3 DPUs and SuperNICs to control the entire Ethernet stack.

### 2.2 Systems & Network OS (NOS) Layer

- **Arista Networks (ANET)**: Dominant high-radix switch vendor in cloud data centers with ~40%+ market share in 100G/400G/800G. Core differentiator is EOS (Extensible Operating System) — a single, state-driven binary with high programmability, fast self-healing, NetDL analytics, and deep hyperscaler operational integration.
- **White-Box / ODMs + SONiC**: Hyperscalers (led by Microsoft and Meta) develop open-source NOS (SONiC) on top of ODM hardware (Accton, Celestica, Quanta). While white-box captures high volume in lower-tier fabrics, mission-critical AI back-end clusters and enterprise deployments favor branded, highly reliable systems like Arista.
- **Cisco Systems**: Incumbent enterprise leader trying to recapture cloud market share with Silicon One and 8000-series routers, but burdened by legacy codebase fragmentation.

### 2.3 Optical Interconnect Layer

- Optical transceivers (800G/1.6T OSFP and QSFP-DD) represent up to 30–40% of the total network bill of materials in AI clusters.
- **LPO vs. DSP**: Linear Pluggable Optics eliminate the power-hungry DSP, reducing latency and cutting transceiver power consumption by ~50%. However, LPO requires pristine signal integrity and close tuning with the host switch SerDes.

---

## 3. Core Architectural Battles

### 3.1 Front-End vs. Back-End Fabrics

- **Front-End Network**: Connects compute nodes to storage, user traffic, management, and inference gateways. Standardized on Ethernet.
- **Back-End (Scale-Out) Fabric**: Interconnects accelerator GPUs/TPUs directly for all-reduce, all-to-all, and tensor-parallel gradient synchronization. This fabric demands zero packet loss, ultra-low latency, and deterministic congestion management.

### 3.2 Ethernet (RoCEv2 / UEC) vs. InfiniBand

- **InfiniBand Strengths**: Credit-based flow control, hardware-offloaded collective operations, sub-microsecond latency. Traditionally dominant in scientific supercomputing and initial generative AI clusters (DGX SuperPODs).
- **Ethernet Counter-Offensive**:
    - **Scale**: Ethernet scales to millions of endpoints without subnet manager bottlenecks.
    - **Supply Chain Multi-Sourcing**: Hyperscalers refuse single-vendor lock-in to Nvidia.
    - **Ultra Ethernet Consortium (UEC)**: Consortium formed by Arista, Broadcom, Cisco, Meta, Microsoft, AMD, Intel, and Google to standardize modern packet spraying, flexible order delivery, receiver-driven flow control, and link-level failover.
    - **Cell-Based Load Balancing (CLB)**: Disassembling packets into equal-sized cells across all paths avoids elephant-flow hash collisions (a major problem in traditional ECMP routing).

---

## 4. Hyperscaler Capex Dynamics & Concentration Risk

The economic foundation of AI networking is hyperscaler capex. The top four hyperscalers (Microsoft, Alphabet, Amazon, Meta) account for >$200B in annual capex, with networking taking a rising share (15–20% of cluster hardware spend).

### Concentration Profile

- Arista's top two customers (traditionally Microsoft and Meta) represent ~40–45% of total revenue.
- Google maintains proprietary optical circuit switching (OCS / Jupiter) and custom TPU interconnects, but deploys commercial Ethernet for general compute and cloud customer pods.
- Any deceleration, capex digestion, or redesign by Microsoft or Meta creates sharp cyclical down-drafts.

---

## 5. Correlated Portfolio Failure Modes & Risk Modeling

In a multi-asset fund holding concentrated positions in technology and cloud infrastructure:

1. **Capex Digestion Shock**: A macro tightening or AI ROI skepticism causes hyperscalers to pause or stretch datacenter deployment schedules. This simultaneously hits:
    - Systems OEMs (Arista - ANET)
    - Cloud Hyperscalers (Google - GOOG)
    - Semiconductor Foundries and Chip Vendors
2. **Correlation Matrix Implication**:
   Under normal market conditions, individual company betas suggest moderate co-movement. However, under an **Industry Capex Pause** or **Silicon Commoditization Shock**, the correlation between ANET, GOOG, and broader tech escalates to $\rho \ge 0.70$.
3. **Kelly Sizing Constraint**:
   Assuming zero correlation across holdings severely underestimates portfolio volatility ($\sigma_p^2 = \mathbf{w}^T \mathbf{\Sigma} \mathbf{w}$) and inflates optimal Kelly sizing by 2–3x. Sizing must explicitly reflect this shared industry factor.

---

## 6. Falsifiable Monitoring Criteria & Signposts

To detect thesis shifts early, track these primary indicators:

- **Ethernet Share in Top 500 AI Clusters**: Tracking the proportion of back-end fabrics using Ethernet/RoCEv2 vs. InfiniBand (target: Ethernet > 60% by 2027).
- **Customer Concentration Dilution**: Whether non-cloud-titan (enterprise, campus, neocloud) revenue grows to >65% of Arista revenue.
- **UEC 1.0/2.0 Silicon Shipments**: Volume commercialization of UEC-compliant NICs and switches from 2026 onwards.
- **Optical Architecture Seam**: Adoption rate of 1.6T transceivers and commercial viability of LPO/CPO in volume production.

{% endraw %}

---
title: "01 - Introducing my AArch64 bare-metal kernel on QEMU virt"
date: 2026-09-08
draft: false
description: "Introduction to the AArch64 bare-metal kernel project and its goals."
summary: "Introduction to the AArch64 bare-metal kernel project and its goals."
series: ["AArch64 Bare-Metal Kernel"]
series_order: 1
tags:
  - AArch64
  - ARM
  - Kernel
  - Assembly
---

Welcome to this new series on my blog! It'll serve as a development journal for a small bare-metal AArch64 kernel, written entirely in assembly and running on QEMU's `virt` machine.

> The project can be found in this repository: [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

---
 
## What is this project about?

This project is supposed to be simple, I have to build a small kernel capable of:
- booting on a virtual AArch64 board (QEMU `virt`)
- talking to the outside world through UART
- handling exceptions and interrupts
- setting up a timer and multitasking
- and, eventually, looking like a (very small) working operating system

> I'm keeping my expectations in check about this *operating system*. I started this project without really knowing where it's going to end up :)

On top of that, I'm only going to use assembly (no C).

---
 
## Why this project?
 
The main reason that pushed me to start this project is to learn ARM assembly language as well as to understand in depth the AArch64 architecture and how it works at a low level (registers, exception levels, MMU, etc.).
 
*Note that v0.1 is already done at the time I'm writing this article: the kernel boots and already prints a message over UART.*
 
---
 
## Target environment
 
| | |
|---|---|
| **Emulator** | QEMU |
| **Machine** | `virt` |
| **Architecture** | AArch64 (ARMv8-A) |
| **CPU** | `cortex-a57` |
| **Language** | AArch64 assembly |
| **Toolchain** | `aarch64-none-elf` |
 
QEMU `virt` exposes a minimal but sufficient board for this project: some RAM, an AArch64 CPU, and a PL011-compatible UART, mapped in MMIO at address `0x09000000`.
 
---
 
## Prerequisites
 
To follow this series comfortably, I'd recommend already having some basic notions of assembly (any architecture works). No prior knowledge of AArch64 is required: I'm starting from scratch myself and I'll explain every instruction used as we go.
 
---

## Detailed development plan
 
Here's the current roadmap of the project, version by version:
 
| Version | Feature |
|---|---|
| v0.1 | Boot and UART |
| v0.2 | Exceptions and interrupts |
| v0.3 | ARM timer |
| v0.4 | Memory management and MMU |
| v0.5 | Exception levels and user mode |
| v0.6 | Multitasking and scheduler |
| v0.7 | Drivers and peripherals |
| v1.0 | Minimal operating system |
 
---
 
## Upcoming articles

Here are, in order, the articles planned for this series:

| Article | Version(s) | Title | Main content |
| ------: | :--------: | ----- | ------------ |
| **01** | - | **Introduction** | Presentation of the project, its goals and its target environment. |
| **02** | **v0.1** | **First boot: linker script, stack and first UART message** | Setting up the linker script, the boot code, stack initialization and the first UART driver to print a message. |
| **03** | **v0.2** | **Taming exceptions: building the vector table** | Building the exception vector table, configuring `VBAR_EL1`, handling synchronous exceptions and IRQs. |
| **04** | **v0.3** | **Setting up the ARM timer** | Configuring the ARM generic timer, setting up periodic interrupts and the basics of timekeeping. |
| **05** | **v0.4** | **Managing physical and virtual memory** | Setting up a simple physical allocator, page tables, MMU configuration and the switch to virtual addressing. |
| **06** | **v0.5** | **First program in user mode** | Detecting and handling exception levels, transitioning to `EL0` and running the first user-mode program. |
| **07** | **v0.6** | **Running several tasks** | Context save/restore, task structure, round-robin scheduler and running multiple kernel tasks. |
| **08** | **v0.7** | **New drivers and peripherals** | Improving the UART driver, adding GPIO support and additional peripherals from the `virt` machine. |
| **09** | **v1.0** | **Wrap-up** | Consolidating all the previous components into a small usable operating system. |
 
---

Thanks in advance to everyone who follows this series. If you have questions, feedback, or just want to chat about the project, feel free to reach out.
 
See you in the next article, where we'll really dive into the code: boot and the first UART driver!
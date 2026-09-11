---
title: "02 - First boot: linker script, stack and first UART message"
date: 2026-09-11
draft: false
description: "Set up the linker script, boot code, and the first UART driver."
summary: "Set up the linker script, boot code, and the first UART driver."
series: ["AArch64 Bare-Metal Kernel"]
series_order: 2
tags:
  - AArch64
  - ARM
  - Kernel
  - Assembly
---

Welcome to the second article of the series on developing my AArch64 bare-metal kernel!

In this article, I'm going to present version v0.1 of this project. The goal of this version is to build a basic kernel that will contain:
- the linker
- the boot
- and the UART driver code

By the end, the kernel should boot correctly in QEMU and print a simple string, `Hello, AArch64!`.

Here are the files involved in this article, and the section that explains each one:

| File | Role | Section |
| --- | --- | --- |
| `linker.ld` | Linker script: where the code sits in memory, defines `_stack_bottom` and `_stack_top` | [The linker script](#the-linker-script) |
| `src/boot/boot.s` | Kernel entry point (`_start`), stack initialization | [Boot: initializing the stack](#boot-initializing-the-stack) |
| `src/uart/uart.s` | Minimal UART driver: `uart_putc` and `uart_puts` | [The UART driver](#the-uart-driver) |
| `Makefile` | Compiles the assembly files and generates `kernel.elf` | [Building and running the kernel](#building-and-running-the-kernel) |

> The project can be found in this repository: [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

---

## QEMU `virt` and basic AArch64 concepts

### What is QEMU `virt`?

First, let me quickly explain what QEMU and the `virt` machine are.

QEMU is an emulator that lets us run our AArch64 kernel without owning any ARM hardware.

The `virt` machine is a generic virtual platform designed to run guest systems. It lets us bypass the constraints of any specific hardware.

### Simplified memory layout

Here's the simplified memory layout relevant to this project:

```
 _______________ 0x00000000
|     Flash     |
|_______________|
|               |
|               |
|               |
|               |
|               |
|_______________|0x40000000
|      RAM      |
|_______________|
```

### Registers and instructions used in this article

In this section, I'm just listing the instructions and registers used; they'll be explained in more detail as the code is walked through.

#### Instructions 

| Instruction | Type               | Role                                                                           |
| ----------- | ------------------ | ------------------------------------------------------------------------------ |
| `ldr`       | Load               | Loads a value from memory, or loads an address with `ldr xN, =...` |
| `ldrb`      | Load               | Loads 1 byte from memory                                               |
| `str`       | Store              | Writes a value to memory                                                    |
| `stp`       | Store Pair         | Saves two registers to memory                                           |
| `ldp`       | Load Pair          | Restores two registers from memory                                      |
| `mov`       | Data movement      | Copies a value from one register to another                                   |
| `tst`       | Test               | Performs a logical AND and updates the flags                                |
| `b`         | Branch             | Performs an unconditional jump                                                |
| `b.ne`      | Conditional branch | Jumps if the previous result was not zero                                |
| `cbz`       | Conditional branch | Jumps if a register equals zero                                                 |
| `bl`        | Branch with Link   | Calls a function and saves the return address in `x30`              |
| `ret`       | Return             | Returns to the address held in `x30`                                       |

#### Registers 

| Register    | Usage in the code                           |
| ----------- | --------------------------------------------------- |
| `x0` / `w0` | Function argument / character sent to the UART |
| `x1`        | UART base address                           |
| `w2`        | Content of the `UART_FR` register                       |
| `x19`       | Pointer to the character string               |
| `x30`       | Link Register (`LR`), return address after `bl`  |
| `sp`        | Stack Pointer                     |


---

## The linker script

Before executing a single instruction, the CPU needs to be told where our code lives in memory. That's the job of the linker script, written in the `linker command language`.

> See: [Linker Scripts](https://wiki.osdev.org/Linker_Scripts)

### Why a custom linker script?

Without a custom linker script, `ld` would use its default script, designed for a hosted system. The problem in our case is that it has no idea where RAM sits on the QEMU `virt` machine — the code would end up placed anywhere, potentially at an address the CPU can't even execute at boot.

Here's the linker script used:

```text
ENTRY(_start)

SECTIONS
{
    . = 0x40000000;

    .text : {
        *(.text*)
    }

    .rodata : {
        *(.rodata*)
    }

    .data : {
        *(.data*)
    }

    .bss : {
        *(.bss*)
    }

    . = ALIGN(16);

    .stack :
    {
        _stack_bottom = .;
        . += 0x10000;
        _stack_top = .;
    }
}
```

So we need to explicitly tell it where to place our code. According to the QEMU `virt` machine documentation, RAM starts at address `0x40000000`. That's why the linker script starts with `. = 0x40000000;`.

> `.` represents the current memory address.

> See: [‘virt’ generic virtual platform (virt) - Hardware configuration information for bare-metal programming](https://www.qemu.org/docs/master/system/arm/virt.html#hardware-configuration-information-for-bare-metal-programming)

### Sections and alignment

Once the starting address is fixed, the linker script organizes the binary into several sections:

- `.text`: the executable code
- `.rodata`: read-only data
- `.data`: initialized data
- `.bss`: uninitialized data

Each block uses a `*` character, for example `*(.text*)` for `.text`. This is necessary because source files don't always declare a plain `.text` section. For example `boot.s` uses `.section .text.boot`. The `*` after `.text` groups every sub-section whose name starts with `.text` into a single final section, regardless of the source file it came from.

Right before `.stack`, there's `. = ALIGN(16);`. The AArch64 calling convention requires the stack pointer (`sp`) to always be aligned on 16 bytes. By explicitly aligning the linker's cursor before defining the stack area, `_stack_top` is guaranteed to respect this constraint from the very first instruction in `boot.s`.

### `_stack_bottom` and `_stack_top`

The `.stack : { ... }` block of the linker script defines the memory area reserved for the stack. It first places the `_stack_bottom` symbol at the current address (the bottom of the stack), then moves the linker's "cursor" forward by `0x10000` (64 KB) with `. += 0x10000;`, before placing `_stack_top` at the new position (the top of the stack).

> The 64 KB size is completely arbitrary, but plenty for this stage of the project.

---

## Boot: initializing the stack

Once the linker script is in place, we can write the very first code executed by the CPU at boot: `_start`.

```asm
.section .text.boot
.global _start

_start:
    ldr x0, =_stack_top
    mov sp, x0

    b .
```

`.section .text.boot` places this code in a sub-section of `.text`, which lets it be picked up by the `*(.text*)` from the linker script seen earlier. `.global _start` makes the symbol visible outside this file, which is necessary since the linker script references this same symbol through `ENTRY(_start)`. The `ENTRY()` command tells the CPU where to start.

### `ldr x0, =_stack_top` / `mov sp, x0`

These two instructions initialize the stack:

```asm
ldr x0, =_stack_top
mov sp, x0
```

`ldr x0, =_stack_top` loads into `x0` the address of the `_stack_top` symbol, defined by the linker script (the top of the reserved stack area). `mov sp, x0` then copies that address into the `sp` register, the stack pointer.

### Why this exact form?

**Why `ldr x0, =_stack_top` and not a plain `mov`?**
The `mov` instruction with an immediate value can only encode a limited number of bits directly in the instruction. Since `_stack_top`'s address is a full 64-bit address, it doesn't always fit in that space. The `ldr x0, =...` pseudo-instruction asks the assembler to generate whatever code is needed to load the full address.

**Why go through `x0` instead of writing directly to `sp`?**
The AArch64 instruction set doesn't allow `sp` as a destination register for this form of `ldr`. So `x0` is used as an intermediate.

---

## The UART driver

Now that our kernel boots, it's time to do something with it. The goal now is to let our kernel print characters to the screen. For that we'll use a UART.

> All the code described in this part can be found in `src/uart/uart.s`.

### What is UART, and why MMIO?

First, a UART (*Universal Asynchronous Receiver Transmitter*) is a hardware peripheral used for serial communication.

MMIO (*Memory-mapped I/O*) means the UART's registers are mapped to specific memory addresses. So reading and writing at those addresses lets us talk directly to the hardware. This means we can use the `ldr` and `str` instructions directly.

### `UART_BASE`, `UART_FR`, `UART_DR`

The UART's base address (`UART_BASE`) is `0x09000000`, fixed by QEMU `virt`.
`UART_FR` is the *flag register*, in other words the device's status: if the `TXFF` bit (mask `0x20`) is set in this register, then the transmit FIFO is full and we can't send data to the device yet. It's at offset `0x18`.

`UART_DR` is the *data register*, in other words where the device receives data — this is where we're going to write a character. It's at offset `0x00`.

So we'll add this to our file:

```asm
.equ UART_BASE, 0x09000000
.equ UART_FR,   0x18
.equ UART_DR,   0x00
.equ UART_TXFF, 0x20
```

### `uart_putc`

First, we're going to write a single character. For that we build a `wait:` loop that loads `UART_FR`'s content into `w2`, tests the TXFF bit with `tst`, and loops back while the FIFO is full (`b.ne wait`).

Once the FIFO is free, we write the character to `UART_DR` (`str w0, [x1, #UART_DR]`); per the AArch64 calling convention, `x0` is the first argument, and `w0` is its lower half (the first 32 bits).

Finally, we return to the caller with `ret`.

Here's the complete function:

```asm
uart_putc:
    ldr x1, =UART_BASE

wait:
    ldr w2, [x1, #UART_FR]
    tst w2, #UART_TXFF
    b.ne wait

    str w0, [x1, #UART_DR]

    ret
```

### `uart_puts`

Now we need to be able to print a whole string. So we'll write a `uart_puts` function that receives a pointer to a null-terminated string in `x0` and loops over that string, calling `uart_putc` for each character.

Here's the function's code:

```asm
uart_puts:
    stp x19, x30, [sp, #-16]!
    mov x19, x0

loop:
    ldrb w0, [x19], #1
    cbz w0, done
    bl uart_putc
    b loop

done:
    ldp x19, x30, [sp], #16
    ret
```

First, we save `x19` and `x30` on the stack (see [Why save `x19`?](#why-save-x19)). We copy `x0`'s content into `x19`, then load the current character from `x19` into `w0`, and increment `x19` by one byte.

For each character, we check whether it's the string's terminator: `cbz w0, done`. If so, we exit the loop (branch to `done`); otherwise we call `uart_putc` on the character and go back to the start of the loop.

Once the whole string has been printed, we restore `x19` and `x30` and return to the caller with `ret`.

### Why save `x19`?

In AArch64, `x19` is a callee-saved register, so `uart_puts` must save it before using it, since `uart_putc` could modify it, then restore it before returning. The `stp x19, x30, [sp, #-16]!` instruction saves both `x19` and the return address `x30` in 16 bytes, while respecting the stack's 16-byte alignment.

---

## Building and running the kernel

Now that the code is written, it's time to build and run the kernel.

### The Makefile

I won't go through the whole Makefile here, just the important parts.

> The project's complete Makefile can be found in the repository: [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

Let's go through this bit of the Makefile:

```makefile
SRC := $(wildcard src/*/*.s)

OUTPUT_DIR := build

OBJ := $(patsubst src/%.s,$(OUTPUT_DIR)/%.o,$(SRC))


$(OUTPUT_DIR)/%.o: src/%.s
	mkdir -p $(@D)
	$(AS) -c $< -o $@
```

- `$(wildcard src/*/*.s)`: looks for every `.s` file in any subfolder of `src/` (so `src/boot/boot.s`, `src/uart/uart.s`, etc.)
- `$(patsubst src/%.s,$(OUTPUT_DIR)/%.o,$(SRC))`: rebuilds the same path under `build/` for each matching object file
- `mkdir -p $(@D)` creates the necessary subfolders under `build/` on the fly

The Makefile will therefore create the following tree:

```text
├── Makefile
└── build/
    ├── boot/
    │   └── boot.o
    ├── uart/
    │   └── uart.o
    └── kernel.elf
```

### Checking symbols with `nm`

Before running the kernel with QEMU, we check that the binary contains what we expect. For that, we use `aarch64-none-elf-nm build/kernel.elf`, which lets us confirm the symbols exist and are resolved — we should find the following symbols:

```text
_start
uart_putc
uart_puts
_stack_bottom
_stack_top
```

`objdump -d build/kernel.elf` can also be used to see the binary's disassembly.

### Running with QEMU

Here's the complete command to run our kernel with QEMU:

```bash
qemu-system-aarch64 \
    -M virt \
    -cpu cortex-a57 \
    -nographic \
    -kernel build/kernel.elf
```

Here's what each option does:

- `-M virt`: use the `virt` virtual machine
- `-cpu cortex-a57`: the emulated AArch64 CPU model
- `-nographic`: no graphical window, everything goes through the terminal (UART redirected to stdout)
- `-kernel build/kernel.elf`: loads our ELF directly

### Result

Here's what we get:

<video controls width="100%">
  <source src="demo-uart.en.mp4" type="video/mp4">
</video>

---

## Conclusion

By the end of this first version, the project now has a linker script that places the code exactly where the CPU expects to find it, a correctly initialized stack, and a first working hardware driver.

Thanks for reading all the way through, and see you in the next article: **Taming exceptions: building the vector table**.
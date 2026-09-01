---
title: "04 - Writing Events to Disk: JSONL Logging, Wake Events and the First Crash"
date: 2026-09-01
draft: false
description: "Writing logs to disk and the first kernel crash of the KDAMonitor driver."
summary: "Writing logs to disk and the first kernel crash of the KDAMonitor driver."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Welcome to the fourth article in the series on developing KDAMonitor!

In this article, I'll cover version v0.4 of the project, along with the first crash encountered along the way. Version v0.4 is mainly about implementing logging via `.jsonl` files. This logging is what finally gives a purpose to the queue implemented previously.

Here are the files covered in this article, and the section that explains each of them:

| File | Role | Section |
| --- | --- | --- |
| `kdamon_config.h` | New centralized constants (log paths) | [Why a Dedicated Thread for Writing?](#why-a-dedicated-thread-for-writing) |
| `log_writer.h` | Public interface of the log writer (`Start`/`Stop`) | [The Dedicated Writer Thread (`log_writer.c`)](#the-dedicated-writer-thread-log_writerc) |
| `log_writer.c` | Opening/closing the file, JSONL serialization, thread, start/stop controllers | [The Dedicated Writer Thread (`log_writer.c`)](#the-dedicated-writer-thread-log_writerc) / [JSONL Logging](#jsonl-logging) |
| `event_queue.c` | Added `WakeEvent` to `KDAMON_EVENT_QUEUE`, signaling in `Push`, new getter | [Wake Events](#wake-events) |
| `driver_entry.c` | Removed test code, wired up `KdaMonLogWriterStart`/`Stop` | [Integration into `driver_entry.c`](#integration-into-driver_entryc) |
| `docs/crashes.md` | Documentation of crash #1 | [The First Crash: `IRQL_NOT_LESS_OR_EQUAL (0xA)`](#the-first-crash-irql_not_less_or_equal-0xa) |

> The project can be found in this repository: [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Why a Dedicated Thread for Writing?

There are two reasons for using a dedicated thread for writing rather than relying on the callbacks:
1. It clearly separates what each object (device, queue, ...) is responsible for, without piling too much responsibility onto a single one.
2. It avoids the slow, blocking parts related to the file (opening, then writing). More details in the next part.

### The Producer/Consumer Coupling Problem

What I call a producer (or supplier) will be the callbacks that will soon be implemented. Each of these callbacks will supply events to the queue, and when they push events into the queue, they will be running at `DISPATCH_LEVEL`. However, at `DISPATCH_LEVEL` the *scheduler* cannot intervene, meaning no blocking I/O is allowed (no disk read/write, no waiting on an object that can sleep).

To solve this problem, a new object dedicated to this task is needed. That way, the entire slow and blocking part (opening a file, writing to it) is offloaded to a separate system thread, which itself runs at `PASSIVE_LEVEL`.

### New Centralized Constants (`kdamon_config.h`)

This is a good time to introduce the new constants:

- `KDAMON_DIR`: the path of the folder assigned to the driver (the whole project) `L"\\??\\C:\\KDAMonitor\\"`.
- `KDAMON_LOG_DIR`: the path of the folder assigned to the driver's log files `L"\\??\\C:\\KDAMonitor\\logs\\"`.
- `KDAMON_LOG_FILE_PREFIX` and `KDAMON_LOG_FILE_EXTENSION`: respectively, the prefix and suffix given to the log file.

Why the `\??\C:\` notation?

This symbolic link belongs to the kernel's object namespace (*Object Manager namespace*); it bridges over to the `C:` drive, a concept specific to the Win32 space that this object namespace doesn't natively know about.

> `\??\` is also known as `\DosDevices\`.

While at it, `kdamon_config.h` also gets a compilation fix: the `STATUS_*` identifiers (used, among others, by `ZwCreateFile`) weren't declared. `<ntstatus.h>` has to be included before `<ntddk.h>`, with `WIN32_NO_STATUS` defined in between to avoid macro conflicts. Here's the final file:

```c
#pragma once

#include <ntstatus.h>
#define WIN32_NO_STATUS
#include <ntddk.h>
#undef WIN32_NO_STATUS

#define DRIVER_TAG "[KDAMonitor]"

#define KDAMON_DEVICE_NAME L"\\Device\\KDAMonitor"
#define KDAMON_SYMLINK_NAME L"\\DosDevices\\KDAMonitor"

#define KDAMON_DIR L"\\??\\C:\\KDAMonitor\\"
#define KDAMON_LOG_DIR L"\\??\\C:\\KDAMonitor\\logs\\"
#define KDAMON_LOG_FILE_PREFIX L"kdamon_"
#define KDAMON_LOG_FILE_EXTENSION L".jsonl"
```

---

## Wake Events

### The Polling Problem

Without a wake-up mechanism, the thread would have to poll the queue in a loop to know whether new events had arrived → wasted CPU, added latency.

### The `WakeEvent` Added to `KDAMON_EVENT_QUEUE`

A new `KEVENT WakeEvent` field was added to the queue's structure (`event_queue.c`), of type `SynchronizationEvent`.

In `KdaMonEventQueuePush`, right before releasing the spinlock: `KeSetEvent(&g_EventQueue.WakeEvent, IO_NO_INCREMENT, FALSE)` — so it's signaled **on every successful push**, still under the spinlock, at `DISPATCH_LEVEL`. `KeSetEvent` is specifically designed to be callable up to `DISPATCH_LEVEL`, unlike waiting primitives on the caller's side — consistent with the choice of spinlock made in article 03.

A new getter, `KdaMonEventQueueGetWakeEvent`, is exposed in `event_queue.h` and used by `log_writer.c` to retrieve a pointer to this event without exposing the entire queue structure.

### Distinction from the Stop Event

It's worth being clear that there are **two distinct events**: `WakeEvent` (carried by the queue, signaled on every new event) and `g_StopEvent` (local to `log_writer.c`, signaled only once, on shutdown). The thread waits on both simultaneously via `KeWaitForMultipleObjects`, which lets it react immediately to a shutdown request without waiting for a hypothetical next event.

---

## The Dedicated Writer Thread (`log_writer.c`)

Before going further in this part, let me introduce a few functions that won't be detailed in this article:

- `KdaMonLogWriterOpenFile` takes care of creating (or verifying the existence of) `C:\KDAMonitor\`, then `C:\KDAMonitor\logs\`, then building a timestamped file name (`kdamon_YYYYMMDD_HHMMSS.jsonl`) and opening it for writing.
- `KdaMonLogWriterCloseFile` closes the log file's handle if it's open (`ZwClose`), then resets it to `NULL`.

The `KdaMonLogWriterWriteEvent` function writes a line into the `.jsonl` file representing an event, and it will be covered in detail in the [JSONL Logging](#jsonl-logging) section.

> With no callbacks implemented yet, this function writes a basic event with no meaningful information. The event contains only: the ID, the event type, and the timestamp.

On top of that, here's the global state maintained by this module:

- `g_ThreadObject`: the pointer to the kernel thread object, kept around so it can be waited on at shutdown (see below).
- `g_StopEvent`: the event signaled to request the thread's shutdown.
- `g_LogFileHandle`: the handle to the currently open log file.

One last object is used but doesn't belong to this module: the `WakeEvent`, part of the event queue's own structure (`event_queue.c`), signaled on every `Push`. It was covered in full detail in the [Wake Events](#wake-events) section, just before.

### Creating the Thread: `IoCreateSystemThread`

Let's start with the function that launches the logger's dedicated thread, `KdaMonLogWriterStart`.

It begins by initializing `g_StopEvent` as a `NotificationEvent`, which will let us wake up the waiting thread:

```c
KeInitializeEvent(&g_StopEvent, NotificationEvent, FALSE);
```

`NotificationEvent` means that once signaled, the event stays signaled indefinitely. Once shutdown has been requested, it must not "auto-consume" itself — it has to remain signaled permanently. The last parameter, `FALSE`, sets the initial state to non-signaled.

Next, the function checks that the log file exists and opens it (`KdaMonLogWriterOpenFile`). Right after that, the system thread is created with `IoCreateSystemThread`:

```c
    status = IoCreateSystemThread(
        DriverObject,               // Driver object to associate the thread with
        &threadHandle,              // A handle to the thread (output)
        THREAD_ALL_ACCESS,          // Access mask requested on this handle
        NULL,                       // ObjectAttributes 
        NULL,                       // ProcessHandle 
        NULL,                       // ClientId 
        KdaMonLogWriterThread,      // The thread's entry routine
        NULL                        // StartContext
    );
```

The first parameter, `DriverObject`, is what sets this function apart from `PsCreateSystemThread`. By passing it here, the I/O Manager associates the created thread with the driver and increments an internal counter of active threads for this driver. In practice, this prevents Windows from unloading the driver until that counter goes back to zero — in other words, as long as the thread is still running. This adds a layer of protection against a premature unload that `PsCreateSystemThread` doesn't offer natively.

The following parameters are left as `NULL`:
- `ObjectAttributes`: no object name to associate.
- `ProcessHandle`: the thread is created in the context of the System process by default.
- `ClientId`: there's no need to retrieve its PID/TID since we'll work directly with an object pointer (see below).

`KdaMonLogWriterThread` is the thread's entry routine (see [The Main Thread Loop (`KdaMonLogWriterThread`)](#the-main-thread-loop-kdamonlogwriterthread)). `StartContext` stays `NULL`: the routine doesn't need to receive anything as a parameter, it retrieves the `WakeEvent` of the queue itself.

If this step fails, the function calls `KdaMonLogWriterCloseFile`.

Here's the final code of this function:

```c
BOOLEAN KdaMonLogWriterStart(_In_ PDRIVER_OBJECT DriverObject)
{
    NTSTATUS status;
    HANDLE threadHandle;

    KeInitializeEvent(&g_StopEvent, NotificationEvent, FALSE);

    status = KdaMonLogWriterOpenFile();
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart: failed to open log file (0x%08X)\n", status));
        return FALSE;
    }

    status = IoCreateSystemThread(
        DriverObject,
        &threadHandle,
        THREAD_ALL_ACCESS,
        NULL,
        NULL,
        NULL,
        KdaMonLogWriterThread,
        NULL
    );
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: IoCreateSystemThread failed (0x%08X)\n", status));
        KdaMonLogWriterCloseFile();
        return FALSE;
    }

    status = ObReferenceObjectByHandle(
        threadHandle,
        THREAD_ALL_ACCESS,
        NULL,
        KernelMode,
        &g_ThreadObject,
        NULL
    );
    ZwClose(threadHandle);
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: ObReferenceObjectByHandle failed (0x%08X)\n", status));
        return FALSE;
    }


    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer started\n"));
    return TRUE;
}
```

### The Main Thread Loop (`KdaMonLogWriterThread`)

Once launched by `IoCreateSystemThread`, the thread runs `KdaMonLogWriterThread` in a loop until it's asked to stop:

```c
static VOID KdaMonLogWriterThread(_In_ PVOID StartContext)
{
    UNREFERENCED_PARAMETER(StartContext);

    PRKEVENT WakeEvent = KdaMonEventQueueGetWakeEvent();
    PVOID WaitObjects[WAIT_OBJECT_COUNT];
    NTSTATUS WaitStatus;
    KDAMON_EVENT Event;


    WaitObjects[0] = &g_StopEvent;
    WaitObjects[1] = WakeEvent;

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer thread started\n"));

    for (;;) {
        WaitStatus = KeWaitForMultipleObjects(
            WAIT_OBJECT_COUNT,
            WaitObjects,
            WaitAny,
            Executive,
            KernelMode,
            FALSE,
            NULL,
            NULL
        );

        if (WaitStatus == STATUS_WAIT_0)
        {
            break;
        }

        while (KdaMonEventQueuePop(&Event))
        {
            KdaMonLogWriterWriteEvent(&Event);
        }
    }

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer thread exiting\n"));

    PsTerminateSystemThread(STATUS_SUCCESS);
}
```

The thread first retrieves the queue's `WakeEvent` field via `KdaMonEventQueueGetWakeEvent` (see [Wake Events](#wake-events)). It then places these two objects into an array (`WaitObjects`): `g_StopEvent` at index 0 and the `WakeEvent` at index 1.

The `for (;;)` loop then waits on both objects simultaneously with `KeWaitForMultipleObjects` in `WaitAny` mode. This mode lets the thread go to sleep and wake up as soon as **either** object becomes signaled.

The return value is used to decide what the code should do next:
- If the return value is `STATUS_WAIT_0`, that corresponds to index 0 of `WaitObjects`, so the signaled object is `g_StopEvent`. If that's the case, the loop is immediately broken out of.
- In every other case, the thread drains the queue entirely via the `while (KdaMonEventQueuePop(&Event))` loop, which pops and writes, via `KdaMonLogWriterWriteEvent`, the events one by one, until the queue is empty, before going back to waiting for the next wake-up.

Once out of the main loop, `PsTerminateSystemThread(STATUS_SUCCESS)` terminates the thread.

### Lifecycle and Clean Shutdown

The thread is stopped via `KdaMonLogWriterStop`, called from `DriverUnload`, before `KdaMonEventQueueDestroy`:

```c
VOID KdaMonLogWriterStop(VOID)
{
    if (g_ThreadObject == NULL) {
        return;
    }

    KeSetEvent(&g_StopEvent, IO_NO_INCREMENT, FALSE);

    KeWaitForSingleObject(g_ThreadObject, Executive, KernelMode, FALSE, NULL);

    ObDereferenceObject(g_ThreadObject);
    g_ThreadObject = NULL;

    KdaMonLogWriterCloseFile();

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer stopped\n"));
}
```

`KeSetEvent(&g_StopEvent, ...)` signals the shutdown; the thread waiting in `KeWaitForMultipleObjects` wakes up with `STATUS_WAIT_0` and exits its loop.

By using `KeWaitForSingleObject(g_ThreadObject, ...)`, a thread object becomes signaled exactly when the thread actually finishes (at the moment of the `PsTerminateSystemThread` call). This call therefore blocks until the thread has actually finished executing — not just until it's been asked to. Without this wait, `DriverUnload` could carry on, and the driver could be unloaded, while the thread is still running.

Once the thread is guaranteed to have terminated, `ObDereferenceObject` releases the reference taken in `KdaMonLogWriterStart`, and `g_ThreadObject` is reset to `NULL`. Finally, `KdaMonLogWriterCloseFile` closes the log file.

---

## JSONL Logging

### Why JSONL?

The JSONL format (*JSON Lines*) consists of writing one valid JSON object per line, rather than a single JSON array wrapping all events. I chose this format for two reasons:
1. each event can be written independently as a simple append, without ever needing to rewrite or close off a wrapping structure;
2. the strict "one line = one event" correspondence makes the file trivial to parse afterward.

> Another point that justified this choice, which I discovered afterward, is that if the process is interrupted abruptly (crash, forced shutdown), the lines already written remain usable as-is.

### Serializing an Event (`KdaMonLogWriterWriteEvent`)

In this part, the format shown is the base serialization common to all event types. The JSON line is built with `RtlStringCbPrintfA`:

```
{"id":...,"type":"...","timestamp":...}\n
```

In code, this gives:

```c
    NTSTATUS status = RtlStringCbPrintfA(
        EventBuffer,
        sizeof(EventBuffer),
        "{\"id\":%lu,\"type\":\"%s\",\"timestamp\":%lld}\n",
        Event->Id,
        KdaMonEventTypeToString(Event->Type),
        Event->Timestamp.QuadPart
    );
```

> `KdaMonEventTypeToString`: a small function that maps the `KDAMON_EVENT_TYPE` enum to a readable string (`"Process"`, `"Network"`, etc.).

`RtlStringCbPrintfA` is used instead of a classic `sprintf`. It's a function from the kernel's *safe strings* library (`ntstrsafe.h`), which explicitly takes the size of the destination buffer (`sizeof(EventBuffer)`) and guarantees it will never write beyond it.

Once the line is built, its exact length is retrieved with `RtlStringCbLengthA`:

```c
    status = RtlStringCbLengthA(EventBuffer, sizeof(EventBuffer), &Length);
```

This length (without the final `\0`) is needed to tell `ZwWriteFile` exactly how many bytes to write:

```c
    status = ZwWriteFile(
        g_LogFileHandle,
        NULL,             // Event
        NULL,             // ApcRoutine
        NULL,             // ApcContext
        &IoStatusBlock,
        EventBuffer,
        (ULONG)Length,
        NULL,             // ByteOffset
        NULL              // Key
    );
```

`ZwWriteFile` is the kernel equivalent of `WriteFile`. It writes to the file using the log file's handle: `g_LogFileHandle`. The `Event` and `ApcRoutine` parameters, left as `NULL`, aren't used here — the call is synchronous, thanks to the `FILE_SYNCHRONOUS_IO_NONALERT` flag set when the file was opened. `IoStatusBlock` receives, as output, the number of bytes actually written along with the status of the operation.

> This function's code isn't shown in full here, since it's only a prototype that will be replaced by the fill-in functions assigned to the callbacks. It can, however, be found in the project's v0.4 release: [v0.4 - Log Writer](https://github.com/HalfTimeOfLife/KDAMonitor/releases/tag/v0.4).

---

## Integration into `driver_entry.c`

First, the log writer's start (`KdaMonLogWriterStart`) needs to be added to `DriverEntry`, and its stop (`KdaMonLogWriterStop`) to `DriverUnload`:

```c
void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
        UNREFERENCED_PARAMETER(DriverObject);

	KdaMonLogWriterStop();
	KdaMonEventQueueDestroy();
	KdaMonDeleteDevice(g_DeviceObject);
	KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}

NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
    ...
	
	if (!KdaMonEventQueueInitialize())
	{
		KdPrint((DRIVER_TAG " [ERROR]: EventQueueInitialize failed\n"));
		return STATUS_UNSUCCESSFUL;
	}
	if (!KdaMonLogWriterStart(DriverObject))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));

    ...

	return STATUS_SUCCESS;
}
```

Next, a simple test is added to `DriverEntry`: two events are created and pushed into the queue. If our log writer works properly, the events should be pulled off the queue in the order they arrived and written into a `.jsonl` file. Here's the final code of `DriverEntry`:

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
	UNREFERENCED_PARAMETER(RegistryPath);

	DriverObject->DriverUnload = DriverUnload;
	DriverObject->MajorFunction[IRP_MJ_CREATE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_CLOSE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL] = KdaMonDeviceControl;

	NTSTATUS status = KdaMonCreateDevice(DriverObject, &g_DeviceObject);
	if (!NT_SUCCESS(status))
	{
		return status;
	}
	
	if (!KdaMonEventQueueInitialize())
	{
		KdPrint((DRIVER_TAG " [ERROR]: EventQueueInitialize failed\n"));
		return STATUS_UNSUCCESSFUL;
	}
	if (!KdaMonLogWriterStart(DriverObject))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));

	// --- BEGIN TEST QUEUE ---
	KDAMON_EVENT testEvent1 = { 0 };
	testEvent1.Type = KdaMonEventProcess;
	KeQuerySystemTimePrecise(&testEvent1.Timestamp);
	KdaMonEventQueuePush(&testEvent1);

	KDAMON_EVENT testEvent2 = { 0 };
	testEvent2.Type = KdaMonEventNetwork;
	KeQuerySystemTimePrecise(&testEvent2.Timestamp);
	KdaMonEventQueuePush(&testEvent2);
	// --- END TEST QUEUE ---

	return STATUS_SUCCESS;
}
```

> Unlike the test in article 03, there's no manual popping here: it's the log thread that will consume these two events on its own, as soon as it's woken up by the `WakeEvent`.

Here's a demonstration of this test running:

<video controls width="100%">
  <source src="demo-log-writer.en.mp4" type="video/mp4">
</video>

---

## The First Crash: `IRQL_NOT_LESS_OR_EQUAL (0xA)`

### Context

The VM produced a **BSOD** (*Blue Screen Of Death*). The dump generated after the crash (found in `C:\Windows\Minidump\`) was kept in the `docs/dumps/` folder of the repository and analyzed with WinDbg (`!analyze -v`).

The bugcheck reported is `IRQL_NOT_LESS_OR_EQUAL (0xA)`:

```
IRQL_NOT_LESS_OR_EQUAL (a)
An attempt was made to access a pageable (or completely invalid) address at an
interrupt request level (IRQL) that is too high.  This is usually
caused by drivers using improper addresses.
If a kernel debugger is available get the stack backtrace.
Arguments:
Arg1: 0000000000000000, memory referenced
Arg2: 0000000000000002, IRQL
Arg3: 0000000000000000, bitfield :
	bit 0 : value 0 = read operation, 1 = write operation
	bit 3 : value 0 = not an execute operation, 1 = execute operation (only on chips which support this level of status)
Arg4: fffff807cdc7274f, address which referenced memory
```

`Arg1` confirms that the memory address referenced was `NULL`, and `Arg2` confirms an IRQL of 2, i.e. `DISPATCH_LEVEL`.

The faulting instruction itself is located in `nt!KeSetEvent`:

```
IP_IN_PAGED_CODE: 
nt!KeSetEvent+1af
fffff807`cdc7274f 4d8b2424        mov     r12,qword ptr [r12]
```

And the call stack confirms the entry point in the driver:

```
STACK_TEXT:  
fffffb8a`2cac8338 fffff807`ce0bece9     : 00000000`0000000a 00000000`00000000 00000000`00000002 00000000`00000000 : nt!KeBugCheckEx
fffffb8a`2cac8340 fffff807`ce0b9fa8     : 00000000`00000000 00000000`00000000 fffff807`6496d0c0 00000000`00000000 : nt!KiBugCheckDispatch+0x69
fffffb8a`2cac8480 fffff807`cdc7274f     : fffffb8a`00000003 fffff807`cdccb2ba 00000000`00000000 00000000`00000000 : nt!KiPageFault+0x468
fffffb8a`2cac8610 fffff807`6496162c     : ffffbf82`00000000 00000000`00000000 00000001`89e45800 00000001`8521b4e3 : nt!KeSetEvent+0x1af
fffffb8a`2cac86a0 ffffbf82`00000000     : 00000000`00000000 00000001`89e45800 00000001`8521b4e3 ffffffff`80003500 : KDAMonitor+0x162c
fffffb8a`2cac86a8 00000000`00000000     : 00000001`89e45800 00000001`8521b4e3 ffffffff`80003500 ffffbf82`ee180000 : 0xffffbf82`00000000
```

`KDAMonitor+0x162c` corresponds to the call to `KeSetEvent` made inside `KdaMonEventQueuePush` (`event_queue.c`), so right after a new event was added to the queue.

### Diagnosis

The faulty code was in `KdaMonEventQueueInitialize`:

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    // Initialized BEFORE the zero-out
    KeInitializeEvent(&g_EventQueue.WakeEvent, SynchronizationEvent, FALSE); 

    KeInitializeSpinLock(&g_EventQueue.Lock);

    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue)); // <- FAULTY

    return TRUE;
}
```

The `RtlZeroMemory` call that followed `KeInitializeEvent` wiped out the entire `g_EventQueue` structure, including the `WakeEvent` that had just been initialized — its self-referencing pointer became `NULL` instead of continuing to point to itself. As a result, the event object was corrupted before it had ever been used.

The crash only happens on the first `Push`. It's `KeSetEvent` that tries to walk this internal wait list, dereferences the `NULL` pointer left by the zeroing-out, and triggers the bugcheck.

### Fix

The fix simply consists of reversing the order of operations: `RtlZeroMemory` first, then initializing the kernel objects.

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue));

    KeInitializeEvent(&g_EventQueue.WakeEvent, SynchronizationEvent, FALSE);
    KeInitializeSpinLock(&g_EventQueue.Lock);

    return TRUE;
}
```

---

## Conclusion

Version v0.4 finally gives a real outlet to the queue built in v0.3: the log writer's thread now automatically drains the queue and writes the retrieved events directly into a `.jsonl` file.

The next version, v0.5, will finally start filling the queue for real, with the first sensor: process creation and termination.

Thanks for reading all the way through, and see you in the next, fifth article of this series: **The First Sensor: Monitoring Process Creation and Termination**.
---
title: "03 - The Event Queue: Structure and Synchronization in the Kernel"
date: 2026-08-21
draft: false
description: "Building the event queue for the KDAMonitor driver."
summary: "Building the event queue for the KDAMonitor driver."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Welcome to the third article in the series on developing KDAMonitor!

In this article, I'll cover version v0.3 of the project. In this version, I focused on implementing the data structure (a queue, in this case) that will store, transmit, and remove the "events" (see [Defining an Event in the Context of KDAMonitor](#defining-an-event-in-the-context-of-kdamonitor)) collected by the sensors.

Here are the files covered in this article, along with the section that explains each one:

| File | Role | Section |
| --- | --- | --- |
| `event_types.h` | Event types and the `KDAMON_EVENT` structure | [Defining an Event in the Context of KDAMonitor](#defining-an-event-in-the-context-of-kdamonitor) |
| `event_queue.h` | Event queue interface and function declarations | [Implementing the Queue](#implementing-the-queue) |
| `event_queue.c` | Event queue implementation and synchronization | [Implementing the Queue](#implementing-the-queue) |
| `driver_entry.c` | Driver entry point, event queue initialization, and test | [Example: Testing the Event Queue](#example--testing-the-event-queue) |

> The project can be found in this repository: [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Defining an Event in the Context of KDAMonitor

Before explaining in detail the data structure I used, let's look at what I consider an event. Here's how the structure is defined in the code:

```c
typedef struct _KDAMON_EVENT
{
    KDAMON_EVENT_TYPE Type;
    LARGE_INTEGER Timestamp;
    ULONG Id;
    // future members for event data
    //union
    //{
    //
    //} Data;
} KDAMON_EVENT, * PKDAMON_EVENT;
```

Let's start with the first three fields of the `KDAMON_EVENT` structure:
- `Type`: This field holds a value corresponding to a type defined in the `KDAMON_EVENT_TYPE` enum.
- `Timestamp`: The timestamp of when the associated callback/callout received the event, which also marks the moment the event was created.
- `Id`: A unique identifier, scoped to the capture session, assigned to the event.

> In this version (v0.3), events only contain `Type`, `Timestamp`, and `Id`. Also, since no callback/callout is implemented yet in this version, the timestamp is set manually.

The `Type` field distinguishes events from one another. Here's the enum it's tied to:

```c
typedef enum _KDAMON_EVENT_TYPE
{
    KdaMonEventImageLoad, // TODO: implemented in v0.6
    KdaMonEventNetwork,   // TODO: implemented in v0.8
    KdaMonEventProcess,   // TODO: implemented in v0.5
    KdaMonEventRegistry,  // TODO: implemented in v0.9
    KdaMonEventThread     // TODO: implemented in v0.10
} KDAMON_EVENT_TYPE;
```

The last field, a union named `Data`, will hold the event's structure depending on its type. As a reminder, the supported events will be:
- Process creation/termination
- Image load
- Network connection
- Registry key creation/deletion/modification
- Thread creation/termination

Each of these types will get a corresponding structure with the relevant details. Events will share a common base, but a good number of details will differ. For example, for a DLL load event (a `KdaMonEventImageLoad`), the DLL's path will be captured. Similarly, for a process creation event, it's the executable's path that will be kept. On the other hand, a destination IP address only concerns `KdaMonEventNetwork`, just as a registry key path only concerns `KdaMonEventRegistry`.

> The specific content of these events (i.e., the fields of their corresponding structures) will be detailed in the articles covering each associated sensor.

---

## Data Structure Used

### What Is a Queue?

A queue is a data structure ... that behaves, well, like a queue :-). More precisely, it's what's known as a FIFO data structure — First In, First Out — just like a line at a store, where the first person to arrive is the first to be served.

In programming, a queue keeps, in practice, a reference to the last element added (the tail) and the first one (the head). Adding an element to this structure means placing it at the tail of the queue.

There are other types of data structures:
- A stack, which is a LIFO structure — Last In, First Out — like a stack of plates: the last one placed on top is also the first one removed.
- A linked list (or simply a list) is a structure that allows elements to be added at the beginning, the end, or anywhere in the middle.

Here's the structure we use to represent the queue:

```c
typedef struct _KDAMON_EVENT_QUEUE
{
    KDAMON_EVENT Buffer[KDAMON_EVENT_QUEUE_SIZE];

    ULONG Head;
    ULONG Tail;
    ULONG Count;

    ULONG DroppedEvents;
    ULONG NextId;

    KSPIN_LOCK Lock;

} KDAMON_EVENT_QUEUE;

static KDAMON_EVENT_QUEUE g_EventQueue;
```

Here's an explanation of every field in this structure:
- `Buffer`: Array of events (`KDAMON_EVENT`) currently in the queue
- `Head`: The head of the queue (oldest element in the queue)
- `Tail`: The tail of the queue (last element added to the queue)
- `Count`: Number of elements in the queue
- `DroppedEvents`: Number of elements the queue failed to keep
- `NextId`: ID to assign to the next event
- `Lock`: Covered in the [Synchronization](#synchronization) section


### Why Use a Queue?

Let's consider the following example:
- We choose a stack as the data structure for this project.
- A first event arrives, and we place it at the top of the stack.
- A second event arrives, and we place it at the top of the stack, above the first event.
- And so on, until we reach the 1000th event. There are two scenarios:
    - Scenario 1: we popped (removed the top element) every time an event arrived -> costly operation, and at that point, what's the actual difference from having no data structure at all?
    - Scenario 2: we popped nothing at all. In that case, the first element we'd retrieve would actually be the most recently captured one, so we'd have to reconstruct the chronological order using the timestamps.

We can conclude that a stack isn't the right choice. Especially since several callbacks will be feeding into the structure, we need one designed for chronological order.

A queue fits this role perfectly. We define a maximum size for our queue, and for each event, we push it onto the queue (`push`) and later remove it from the head of the queue (`pop`), in the order it was added. One downside of this implementation is that the queue has a fixed size, meaning that if too many events arrive while the queue is already full, the new events get rejected instead of added.

But what happens if two sensors add an event to the queue at the same time? To solve this, we're going to need synchronization.

### Synchronization

Concretely, here's the problem:

The network callback and the process creation callback both add an event at the same time. Without protection, both could read the same value of `NextId` before either one increments it, thus assigning the same ID to two different events.

Another problem: what happens if a producer (a callback) is in the middle of adding an event to the queue (and therefore modifying `Tail` and `Count`) while a consumer removes one at the same time, reading those same fields? The consumer could then read `Count` or `Tail` in an intermediate, inconsistent state, which could corrupt the queue's order or cause it to read an event that hasn't been fully written yet.

To solve this problem, we need mutual exclusion over the fields of our queue's structure. In other words, when one component of our driver modifies the buffer, the `Head`/`Tail`/`Count` indices, or the `NextId` counter, no one else should be able to modify them at the same time.

So we're going to use a **synchronization primitive**.

### Synchronization Primitives: The Spinlock

The synchronization primitive I chose is the **spinlock**, for two reasons:
1. I had never implemented this primitive before.
2. It matched a real technical constraint of the project.

But concretely, what is a spinlock?

To put it simply, a spinlock is a bit like a fitting room: if someone's already inside, the door is locked. If a new person shows up, they have no choice but to wait right outside, constantly checking whether the door has unlocked. They won't go sit somewhere else and wait to be notified that the room is free.

That's exactly what a spinlock does: a thread that can't acquire it stays active, "checking" in a loop (*busy-wait*), instead of going to sleep — unlike a mutex, where the waiting thread would instead be notified once the resource becomes available. However, the waiting thread consumes CPU for the entire duration of the wait. A spinlock is therefore only suited to very short critical sections.

Here's an example using the `KeAcquireSpinLock` and `KeReleaseSpinLock` functions:

```c
KIRQL OldIrql;

KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

// critical section: exclusive access to g_EventQueue, which represents our queue

KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
```

`KeAcquireSpinLock` raises the current IRQL to `DISPATCH_LEVEL` and saves the previous IRQL in `OldIrql`, so that `KeReleaseSpinLock` can restore it once the critical section is done.

Now, why choose a spinlock over a mutex to protect `g_EventQueue`? The answer lies in the IRQL (*Interrupt Request Level*), which represents the interrupt priority level the processor is currently executing code at.

A mutex can only be acquired at `PASSIVE_LEVEL`, the lowest level. That's because when a thread fails to acquire a mutex, it's put to sleep by the scheduler while it waits for the resource to become available. But this sleep is only possible if the scheduler itself is able to intervene, which is no longer the case once you go above `PASSIVE_LEVEL`.

A spinlock doesn't have this limitation. As explained above, a thread waiting on a spinlock busy-waits instead of going to sleep, so it can be acquired at any IRQL, up to and including `DISPATCH_LEVEL`.

The driver's future sensors (process creation, image load, registry access, network via WFP) will each be implemented through a kernel callback or callout, and these callbacks don't all run at the same IRQL. If `g_EventQueue` had been protected by a mutex, a callback running at `DISPATCH_LEVEL` would have triggered a bugcheck when attempting to acquire it.

Now that the theoretical groundwork is laid, let's move on to the implementation!

---

## Implementing the Queue

We already introduced the `KDAMON_EVENT_QUEUE` structure we'll be using for the queue earlier (see [What Is a Queue?](#what-is-a-queue)). Let's move on to the functions that let us interact with it.

> All the functions (and the structure) shown here live in the `event_queue.c` file.

### Initialization (and Destruction of the Queue)

To create the queue, we implement a `KdaMonEventQueueInitialize` function with only two responsibilities:
- zeroing out the `KDAMON_EVENT_QUEUE` structure via the global object: `static KDAMON_EVENT_QUEUE g_EventQueue;`
- initializing the structure's spinlock with `KeInitializeSpinLock`: `KeInitializeSpinLock(&g_EventQueue.Lock);`

This function returns `TRUE`.

The `KdaMonEventQueueDestroy` function exists but doesn't do anything for now (it's empty), for a simple reason: the entire structure is static, so there's nothing to manually free. Here's the code for both functions:

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue));

    KeInitializeSpinLock(&g_EventQueue.Lock);

    return TRUE;
}

VOID KdaMonEventQueueDestroy(VOID)
{
}
```

### Adding and Removing Events

To interact with the queue, there are 3 functions:
- `EventQueueNextIndex`: Computes the next index in the circular buffer, wrapping back to 0 once the end of the buffer is reached (`KDAMON_EVENT_QUEUE_SIZE`). Used by both `Push` and `Pop` to advance `Tail` and `Head`.
- `KdaMonEventQueuePush`: Adds an element to the queue.
- `KdaMonEventQueuePop`: Removes an element from the queue.

`EventQueueNextIndex` is fairly self-explanatory:

```c
static ULONG EventQueueNextIndex(_In_ ULONG Index)
{
    Index++;

    if (Index == KDAMON_EVENT_QUEUE_SIZE)
    {
        Index = 0;
    }

    return Index;
}
```

The code for `KdaMonEventQueuePush` and `KdaMonEventQueuePop` is more involved. Here's `KdaMonEventQueuePush`:

```c
BOOLEAN KdaMonEventQueuePush(_In_ KDAMON_EVENT* Event)
{
    KIRQL OldIrql;

    if (Event == NULL)
    {
        return FALSE;
    }

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    if (g_EventQueue.Count == KDAMON_EVENT_QUEUE_SIZE)
    {
        g_EventQueue.DroppedEvents++;
        KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
        return FALSE;
    }

    Event->Id = g_EventQueue.NextId++;

    g_EventQueue.Buffer[g_EventQueue.Tail] = *Event;
    g_EventQueue.Tail = EventQueueNextIndex(g_EventQueue.Tail);

    g_EventQueue.Count++;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return TRUE;
}
```

The function starts with a check: if `Event` is `NULL`, it returns `FALSE` immediately without touching the lock.

The spinlock is then acquired, and everything that follows runs inside the critical section we introduced earlier (see [Synchronization Primitives: The Spinlock](#synchronization-primitives--the-spinlock)).

There are two cases to handle:
- First case: the queue is full (`Count == KDAMON_EVENT_QUEUE_SIZE`). In this case, the event isn't added. `DroppedEvents` is incremented, and the function returns `FALSE`. This way, the caller knows the event wasn't recorded, without ever risking putting a kernel callback to sleep.
- Second case: the queue isn't full, so the event can be added. The first thing that happens is assigning the `Id`: `Event->Id = g_EventQueue.NextId++`. The event is then copied into the buffer at position `Tail`, the `Tail` index is advanced via `EventQueueNextIndex`, and `Count` is incremented to reflect the queue's new state. The lock is released, and the function returns `TRUE`.

Here's `KdaMonEventQueuePop`:

```c
BOOLEAN KdaMonEventQueuePop(_Out_ KDAMON_EVENT* Event)
{
    KIRQL OldIrql;

    if (Event == NULL)
    {
        return FALSE;
    }

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    if (g_EventQueue.Count == 0)
    {
        KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
        return FALSE;
    }

    *Event = g_EventQueue.Buffer[g_EventQueue.Head];
    g_EventQueue.Head = EventQueueNextIndex(g_EventQueue.Head);

    g_EventQueue.Count--;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return TRUE;
}
```

This function is essentially a mirror of `KdaMonEventQueuePush`. The beginning is strictly identical. But the cases to handle are different:
- First case: the queue is empty (`Count == 0`), in which case the spinlock is released and the function returns `FALSE`. There's nothing to remove from the queue.
- Second case: the queue has at least one event.
    - The event at `g_EventQueue.Buffer[g_EventQueue.Head]` is copied into `*Event`, the output parameter provided by the caller.
    - The next index in the buffer is then computed using `EventQueueNextIndex` and stored in `g_EventQueue.Head`.
    - Finally, the total number of elements in the queue is decremented (`g_EventQueue.Count--`).

### Current Size of the Queue

The last function implemented is `KdaMonEventQueueCount`. This function lets us safely check (using the spinlock) how many elements are currently in the queue:

```c
ULONG KdaMonEventQueueCount(VOID)
{
    KIRQL OldIrql;
    ULONG EventCount;

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    EventCount = g_EventQueue.Count;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return EventCount;
}
```

---

## Example: Testing the Event Queue

To validate that the queue works as intended, I added a test directly inside `DriverEntry`, between the `// --- BEGIN TEST QUEUE ---` and `// --- END TEST QUEUE ---` markers:

```c
#include "driver.h"
#include "device.h"
#include "ioctl.h"
#include "kdamon_config.h"
#include "event_queue.h"


PDEVICE_OBJECT g_DeviceObject = NULL;

void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
    UNREFERENCED_PARAMETER(DriverObject);

    KdaMonEventQueueDestroy();
    KdaMonDeleteDevice(g_DeviceObject);
    KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}

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

    KdPrint((DRIVER_TAG " [TEST]: Queue count after 2 pushes = %lu\n", KdaMonEventQueueCount()));

    KDAMON_EVENT popped;
    while (KdaMonEventQueuePop(&popped)) {
        KdPrint((DRIVER_TAG " [TEST]: Popped event Id=%lu Type=%d\n", popped.Id, popped.Type));
    }

    KdPrint((DRIVER_TAG " [TEST]: Queue count after pops = %lu\n", KdaMonEventQueueCount()));
    // --- END TEST QUEUE ---

    return STATUS_SUCCESS;
}
```

The flow is simple:
1. Two events are pushed onto the queue (a `KdaMonEventProcess` and a `KdaMonEventNetwork`)
2. `KdaMonEventQueueCount` is called to confirm the queue holds 2 events.
3. A loop pops every event one by one until `KdaMonEventQueuePop` returns `FALSE` (empty queue), logging the `Id` and `Type` of each retrieved event.

We'd expect to first retrieve the `Process` event (`Id = 0`), then the `Network` event (`Id = 1`) — in the exact order they were added, confirming the queue's FIFO behavior. Finally, `KdaMonEventQueueCount` is called one last time to confirm the queue is back to 0.

Here's a demonstration of this test running:

<video controls width="100%">
  <source src="demo-queue.en.mp4" type="video/mp4">
</video>

---

## Conclusion

KDAMonitor now has a generic event structure (`KDAMON_EVENT`) and a circular queue capable of storing it, protected by a spinlock compatible with any IRQL up to `DISPATCH_LEVEL`.

The `DroppedEvents` counter, which tracks the number of events rejected due to a full queue, is correctly incremented but isn't exposed or checked anywhere yet.

The next version (v0.4) will give this queue an actual purpose: a dedicated thread will drain it automatically to a log file. Once that piece is in place, the following versions (v0.5 and beyond) will finally be able to start filling the queue via kernel callbacks/callouts (process creation, image load, registry, network, and thread).


Thanks for reading all the way through, and see you in the next, fourth article of this series: **Writing Events to Disk: JSONL Logging, Wake Events and the First Crash**.
---
title: "02 - Building the Driver Foundation: DriverEntry, Device Object and IOCTL Communication"
date: 2026-08-08
draft: false
description: "Building the KDAMonitor driver foundation: device object and the first IOCTL communication with a test client."
summary: "Building the KDAMonitor driver foundation: device object and the first IOCTL communication with a test client."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Welcome to the second article in the KDAMonitor development series!

In this article, I'll cover versions v0.1 and v0.2 of the project. As a reminder:

- **v0.1**: Driver basics (`DriverEntry`) and a short example
- **v0.2**: Adding a device and IOCTL communication, with a sample client

Here are the files covered in this article, along with the section explaining each one:

| File | Role | Section |
|---|---|---|
| `driver_entry.c` | Driver entry point, routine registration | [What is a driver?](#what-is-a-driver) |
| `device.c` | Device and symbolic link creation | [How do you communicate with the driver?](#how-do-you-communicate-with-the-driver) |
| `ioctl.c` | IRP dispatch and echo IOCTL handling | [IOCTL](#ioctl) |
| `kdamon_shared.h` | IOCTL code and driver/client shared structures | [Anatomy of an IOCTL code](#anatomy-of-an-ioctl-code) |
| `kdamon_config.h` | Centralized constants (device name, symbolic link name, log tag) | - |
| `client/src/client.c` | Usermode test client, validates the echo exchange | [Example: the test client](#example-the-test-client) |

> The project can be found in this repository: [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## What is a driver?

A driver is a program that lets the operating system communicate with a machine's components. Without drivers, the operating system wouldn't know how to talk to the graphics card, the network card, the keyboard, the mouse, etc. On Windows, these programs use the `.sys` extension.

That said, not all drivers exist solely to handle communication between components and the system. In fact, there are several types of drivers:
- **hardware drivers**, described above
- **software drivers**, which don't depend on a specific component

For example, KDAMonitor is a **software driver**: it doesn't depend on any physical component of the machine it's installed on.

This raises a natural question: what's the point of a driver compared to a regular executable (`.exe`)? The main advantage of a driver is that it runs in kernel space, which grants it far higher privileges, direct access to physical memory and hardware, and (almost) none of the security boundaries that normally isolate usermode processes from one another. Here's a diagram illustrating communication between user-mode and kernel-mode components:

![kernelmodeusermode](./userandkernelmode01.png)
*Source: [Microsoft — User Mode and Kernel Mode](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/user-mode-and-kernel-mode)*

Concretely, for KDAMonitor, this level of privilege lets us observe system events (process creation, network connections, etc.) that a standard (usermode) application cannot observe.

However, while a driver brings a lot of advantages, it also comes with a few downsides — particularly when a crash occurs. In a regular executable, most of the time, if the program hits an error or crashes, the system simply carries on. In contrast, an error in a driver (a crash, a bad memory access) can bring down the entire system (a **Blue Screen Of Death (BSOD)**).

> In an upcoming article, I'll walk through the first issue I ran into that crashed my test VM :-)

On top of that, unlike an executable that you simply *click* to launch, a driver requires more steps. It's dynamically loaded into kernel memory space by the **Windows I/O Manager**, via the **Service Control Manager (SCM)**.

Now that the concept of a driver is clearer, I'll show how to create one — but first, we need to understand the structure of a driver's program.

### DriverEntry and DriverUnload

`DriverEntry` is a driver's entry point, roughly equivalent to a `main()`, though with some key differences. Its standard signature is:

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath);
```
Here's what its arguments mean:
- `DriverObject`: the structure representing the driver within the system
- `RegistryPath`: the registry path associated with the driver

> The **\_In\_** annotations are part of the *Source (Code) Annotation Language (SAL)*. They're transparent to the compiler, but provide useful metadata for human readers and static analysis tools. For more information on SAL, see the official Microsoft documentation: [Understanding SAL](https://learn.microsoft.com/en-us/cpp/code-quality/understanding-sal?view=msvc-170).

`DriverEntry` **MUST** return an `NTSTATUS`, which can take on many different values, the most important being `STATUS_SUCCESS`. If `DriverEntry` doesn't return `STATUS_SUCCESS`, the driver fails to load.

> See [2.3.1 NTSTATUS Values](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) for the full list of possible `NTSTATUS` values.

And what if we want to properly remove the driver? That's the role of the `DriverUnload` routine on the `DriverObject`:

```c
DriverObject->DriverUnload = ...;
```

This routine is optional, but strongly recommended so the driver can be unloaded cleanly.

### Example: displaying the Windows version

In Pavel Yosifovich's book, **Windows Kernel Programming**, an exercise is proposed. Starting from the following `DriverEntry` skeleton, the goal is to make the driver print the Windows version (major, minor, and build number) via `KdPrint`, using the `RtlGetVersion` function:

```c
#include "driver.h"

// DRIVER_TAG is defined in driver.h : #define DRIVER_TAG "[KDAMonitor]"

void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
  UNREFERENCED_PARAMETER(DriverObject);

  KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}

NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
  UNREFERENCED_PARAMETER(RegistryPath);
  DriverObject->DriverUnload = DriverUnload;

  KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));
  return STATUS_SUCCESS;
}
```

To solve this exercise, we need `RtlGetVersion`, which fills in an `RTL_OSVERSIONINFOW` structure containing the requested version information. One important detail not to forget: the `dwOSVersionInfoSize` field of this structure must be set **before** calling `RtlGetVersion`, otherwise the function fails.

Here's `DriverEntry` completed with this logic, right before the `return STATUS_SUCCESS`:

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
	UNREFERENCED_PARAMETER(RegistryPath);
	DriverObject->DriverUnload = DriverUnload;

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));

	RTL_OSVERSIONINFOW lpVersionInformation = { 0 };
	lpVersionInformation.dwOSVersionInfoSize = sizeof(lpVersionInformation);

	NTSTATUS status = RtlGetVersion(&lpVersionInformation);

	if (NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [SUCCESS]: Windows %lu.%lu Build %lu\n",
			lpVersionInformation.dwMajorVersion,
			lpVersionInformation.dwMinorVersion,
			lpVersionInformation.dwBuildNumber
			));
	}
	else
	{
		KdPrint((DRIVER_TAG " [ERROR]: Windows version not found\n"));
	}

	return STATUS_SUCCESS;
}
```

> For more information on the `RtlGetVersion` function, see the Microsoft documentation: [RtlGetVersion function (wdm.h)](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-rtlgetversion).

Note the use of the `NT_SUCCESS` macro, which checks whether an `NTSTATUS` represents a success — a macro we'll use throughout this project.

Finally, one last important detail: messages sent via `KdPrint` are **not** displayed in a regular console. They're only visible through a kernel debugger like **WinDbg**, or a tool like **DebugView** (Sysinternals). By default, `KdPrint` only works in debug builds. For the rest of the project, I'll be using **DebugView**.

---

## How do you communicate with the driver?

Because of the user/kernel separation that exists in the system, the driver remains unreachable from user space.

For now, this isn't a problem for our driver, but once a client is added to the project, it will become necessary to let the driver communicate with it. To do that, we need to create a device.

A device is the object the driver exposes to the rest of the system, through which messages (between driver and client) will flow.

These messages exchanged between the client and the driver take the form of an I/O Request Packet (IRP), the standard data structure Windows uses to transmit any I/O request to a driver. Every action (opening the device, sending a command, closing it) generates a different IRP, which the driver must know how to handle.

In code, a device is an instance of the `DEVICE_OBJECT` structure, and we'll now see how to create one.

### Creating a device with IoCreateDevice

To create a device, we need the [IoCreateDevice](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-iocreatedevice) function. Here are its most important parameters:

- `DriverObject`: the driver the device will be "attached" to
- `DeviceName`: the device's kernel name (for KDAMonitor, `L"\\Device\\KDAMonitor"`)
- `DeviceType`: the device type — `FILE_DEVICE_UNKNOWN` in our case, since KDAMonitor isn't tied to any specific hardware
- `Exclusive`: if `TRUE`, only one client can open a handle at a time; `FALSE` allows multiple simultaneous connections
- `DeviceObject`: receives the newly created `DEVICE_OBJECT` as output

Like most kernel functions, it returns an `NTSTATUS` to check.

`IoCreateDevice` leaves the `DO_DEVICE_INITIALIZING` flag set on the newly created device, which prevents any client from opening it. It must be explicitly cleared once initialization is complete:

```c
(*DeviceObject)->Flags &= ~DO_DEVICE_INITIALIZING;
```

The device must eventually be destroyed with `IoDeleteDevice` once it's no longer needed — this is the role of `KdaMonDeleteDevice`, called from `DriverUnload`.

### Making the device accessible: IoCreateSymbolicLink

Even once created, the device is only identified by its kernel name (`\Device\KDAMonitor`). To let a client open this device with a simple `CreateFileW` call, we need to bridge the kernel namespace and the usermode namespace. That's the role of [IoCreateSymbolicLink](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-iocreatesymboliclink).

This function takes the following parameters:
- `SymbolicLinkName`: the name accessible from user space (for example `\DosDevices\KDAMonitor`, which a client will open as `\\.\KDAMonitor`)
- `DeviceName`: the kernel name of the target device, the same one given earlier to `IoCreateDevice`

As usual, it returns an `NTSTATUS` to check.

> Microsoft notes that this function isn't generally recommended for WDM drivers: a proper WDM driver should expose its device via `IoRegisterDeviceInterface`.

Without this symbolic link, the device would still exist in memory, but would remain completely unreachable from any usermode program.

### Buffered I/O vs Direct I/O

> This section touches a bit on the IRP structure, covered in detail in the next part. Feel free to skip it and read the next section first.

When a client sends or receives data through the device, that data has to travel somehow between user space and kernel space. Windows offers several methods for this, and our driver uses the `DO_BUFFERED_IO` flag.

With **Buffered I/O**, the I/O Manager allocates an intermediate buffer in kernel memory, copies the client's data into it (or the reverse), then makes this buffer available to the driver via `Irp->AssociatedIrp.SystemBuffer` (a field of the IRP structure I'll detail in the next section). The driver never directly accesses the client's memory.

The alternative is **Direct I/O** (`DO_DIRECT_IO`), which uses *Memory Descriptor Lists* (MDLs) to let the driver access the client buffer's physical pages directly, without an intermediate copy. It's faster for large volumes of data (since it avoids the copy), but more complex to implement (an example is given in Pavel Yosifovich's book, *Windows Kernel Programming*, Chapter 7).

For KDAMonitor, the exchanges stay small (an echo for now, JSON events later on), so Buffered I/O is more than sufficient and much simpler to implement.

### Putting it all together: device.c

Here's what `KdaMonCreateDevice` and `KdaMonDeleteDevice` look like once all these pieces come together:

```c
#include "device.h"
#include "kdamon_config.h"
// KDAMON_DEVICE_NAME is defined in kdamon_config.h : L"\\Device\\KDAMonitor"
// KDAMON_SYMLINK_NAME is defined in kdamon_config.h : L"\\DosDevices\\KDAMonitor"

NTSTATUS KdaMonCreateDevice(_In_ PDRIVER_OBJECT DriverObject, _Outptr_ PDEVICE_OBJECT* DeviceObject)
{
	UNICODE_STRING devName = RTL_CONSTANT_STRING(KDAMON_DEVICE_NAME);
	UNICODE_STRING symLink = RTL_CONSTANT_STRING(KDAMON_SYMLINK_NAME);

	NTSTATUS status = IoCreateDevice(
		DriverObject,
		0,
		&devName,
		FILE_DEVICE_UNKNOWN,
		0,
		FALSE,
		DeviceObject
	);
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: IoCreateDevice failed (0x%08X)\n", status));
		return status;
	}

	(*DeviceObject)->Flags |= DO_BUFFERED_IO;

	status = IoCreateSymbolicLink(&symLink, &devName);
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG " [ERROR]: IoCreateSymbolicLink failed (0x%08X)\n", status));
		IoDeleteDevice(*DeviceObject);
		*DeviceObject = NULL;
		return status;
	}

	(*DeviceObject)->Flags &= ~DO_DEVICE_INITIALIZING;

	KdPrint((DRIVER_TAG " [SUCCESS]: Device object and symbolic link created\n"));
	return STATUS_SUCCESS;
}

void KdaMonDeleteDevice(_In_opt_ PDEVICE_OBJECT DeviceObject)
{
	UNICODE_STRING symLink = RTL_CONSTANT_STRING(KDAMON_SYMLINK_NAME);

	IoDeleteSymbolicLink(&symLink);

	if (DeviceObject != NULL)
	{
		IoDeleteDevice(DeviceObject);
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Device object and symbolic link deleted\n"));
}
```

---

## IOCTL

Having an open device isn't enough on its own: we still need a way for a client to send a command to the driver, and for the driver to respond. That's the role of **IOCTLs** (I/O Control) — generic requests a usermode program sends to a driver via the Win32 `DeviceIoControl` call, outside the usual read/write operations (`ReadFile`/`WriteFile`). This is the mechanism that lets each driver define its own "commands." In our case, that'll be a simple echo, to start with.

### What is an IRP?

Every time a client interacts with the device (opening it, sending a command, closing it), Windows wraps that request in a structure called an **I/O Request Packet (IRP)**.

> For more information on this structure, see the official documentation: [IRP structure (wdm.h)](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/ns-wdm-_irp).

The I/O Manager creates the IRP and sends it to the driver via the `IoCallDriver` function. Once the request has been processed, the driver signals completion via `IoCompleteRequest`.

An IRP is never alone: it's always accompanied by at least one **I/O Stack Location** structure (`IO_STACK_LOCATION`), which holds the parameters specific to the request (the requested IOCTL code, buffer size, etc.). To access it, the driver uses the `IoGetCurrentIrpStackLocation` macro.

This is precisely where the `SystemBuffer` field mentioned in the previous section lives: when the IOCTL code uses `METHOD_BUFFERED`, it's through `Irp->AssociatedIrp.SystemBuffer` that the driver accesses the data sent by the client.

### IRP dispatch (CREATE, CLOSE, DEVICE_CONTROL)

Every IRP carries a **major function code** (`IRP_MJ_XXX`), which tells the driver what operation to perform. For each code the driver wants to handle, it must register a corresponding **dispatch routine** — a function automatically called by the system whenever an IRP with that code arrives. All dispatch routines share the same signature:

```c
NTSTATUS DriverDispatch(PDEVICE_OBJECT DeviceObject, PIRP Irp);
```

This registration happens in `DriverEntry`, via the `DriverObject->MajorFunction[...]` array. In KDAMonitor's case, here's what needs to be added to `DriverEntry`:

```c
DriverObject->MajorFunction[IRP_MJ_CREATE] = KdaMonCreateClose;
DriverObject->MajorFunction[IRP_MJ_CLOSE] = KdaMonCreateClose;
DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL] = KdaMonDeviceControl;
```

- `IRP_MJ_CREATE` corresponds to a `CreateFile` call on the client side. Most drivers simply complete the IRP with a success status, which is the case for KDAMonitor at this stage
- `IRP_MJ_CLOSE` is the opposite, triggered by `CloseHandle`
- `IRP_MJ_DEVICE_CONTROL` is the real entry point for communication: every `DeviceIoControl` request from the client goes through this code, with the requested IOCTL code stored in the IRP's `IO_STACK_LOCATION`

> There are other dispatch routines as well — see the official documentation: [DRIVER_DISPATCH callback function (wdm.h)](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nc-wdm-driver_dispatch).

Once a dispatch routine decides to handle an IRP, it must always **complete** it via `IoCompleteRequest`.

### Anatomy of an IOCTL code

An **IOCTL code** is simply a numeric value that identifies a specific command for the driver. This code isn't arbitrary — it's built using the `CTL_CODE` macro, which packs several pieces of information into a single 32-bit integer:

```c
#define CTL_CODE(DeviceType, Function, Method, Access) \
    (((DeviceType) << 16) | ((Access) << 14) | ((Function) << 2) | (Method))
```

- **DeviceType**: the target device type. Values 0–32767 are reserved for Microsoft, while 32768 (`0x8000`) and above are free for third-party developers — exactly the value used by `KDAMON_DEVICE_TYPE`
- **Function**: the internal code for the requested operation. Values 0–2047 are reserved for Microsoft, while 2048 (`0x800`) and above are free — again, the starting value chosen for `IOCTL_KDAMON_ECHO`
- **Method**: the buffer transfer method — `METHOD_BUFFERED`, already covered in the previous section, or the Direct I/O variants (`METHOD_IN_DIRECT`, `METHOD_OUT_DIRECT`), or `METHOD_NEITHER`, where the driver receives raw pointers directly and must validate them itself
- **Access**: the access level required to send this IOCTL — `FILE_ANY_ACCESS` in our case, which doesn't impose any particular restriction

Here's how these pieces combine in `kdamon_shared.h` to define our first IOCTL, a simple echo:

```c
#define KDAMON_DEVICE_TYPE 0x8000
#define IOCTL_KDAMON_ECHO CTL_CODE(KDAMON_DEVICE_TYPE, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)
```

This file also defines the request and reply structures associated with this IOCTL:

```c
typedef struct _KDAMON_ECHO_REQUEST
{
    ULONG Value;
} KDAMON_ECHO_REQUEST, * PKDAMON_ECHO_REQUEST;

typedef struct _KDAMON_ECHO_REPLY
{
    ULONG Value;
} KDAMON_ECHO_REPLY, * PKDAMON_ECHO_REPLY;
```

This `kdamon_shared.h` file is meant to be **shared** between the driver and the client — the only way to guarantee both sides agree on the same IOCTL code and the same data structures.

### Putting it all together: ioctl.c

Here's how all these pieces (IRP dispatch, IRP_MJ_CREATE/CLOSE/DEVICE_CONTROL, I/O Stack Location, `SystemBuffer`, IOCTL code) come together in `ioctl.c`:

```c
#include "ioctl.h"
#include "kdamon_shared.h"
#include "kdamon_config.h"

NTSTATUS KdaMonCreateClose(_In_ PDEVICE_OBJECT DeviceObject, _In_ PIRP Irp)
{
    UNREFERENCED_PARAMETER(DeviceObject);

    Irp->IoStatus.Status = STATUS_SUCCESS;
    Irp->IoStatus.Information = 0;
    IoCompleteRequest(Irp, IO_NO_INCREMENT);
    return STATUS_SUCCESS;
}

NTSTATUS KdaMonDeviceControl(_In_ PDEVICE_OBJECT DeviceObject, _In_ PIRP Irp)
{
    UNREFERENCED_PARAMETER(DeviceObject);

    PIO_STACK_LOCATION stack = IoGetCurrentIrpStackLocation(Irp);
    NTSTATUS status = STATUS_SUCCESS;
    ULONG_PTR information = 0;

    switch (stack->Parameters.DeviceIoControl.IoControlCode) {
    case IOCTL_KDAMON_ECHO:
    {
        ULONG inLen = stack->Parameters.DeviceIoControl.InputBufferLength;
        ULONG outLen = stack->Parameters.DeviceIoControl.OutputBufferLength;

        if (inLen < sizeof(KDAMON_ECHO_REQUEST) || outLen < sizeof(KDAMON_ECHO_REPLY))
        {
            status = STATUS_BUFFER_TOO_SMALL;
            break;
        }

        PKDAMON_ECHO_REQUEST request = (PKDAMON_ECHO_REQUEST)Irp->AssociatedIrp.SystemBuffer;

        KDAMON_ECHO_REPLY reply;
        reply.Value = request->Value;

        RtlCopyMemory(Irp->AssociatedIrp.SystemBuffer, &reply, sizeof(reply));
        information = sizeof(reply);
        break;
    }
    default:
        status = STATUS_INVALID_DEVICE_REQUEST;
        KdPrint((DRIVER_TAG " [ERROR]: Unknown IOCTL 0x%08X\n",
            stack->Parameters.DeviceIoControl.IoControlCode));
        break;
    }
    Irp->IoStatus.Status = status;
    Irp->IoStatus.Information = information;
    IoCompleteRequest(Irp, IO_NO_INCREMENT);

    return status;
}
```

A few things worth noting about this code:

- `KdaMonCreateClose` handles both `IRP_MJ_CREATE` and `IRP_MJ_CLOSE`
- `KdaMonDeviceControl` first retrieves the current `IO_STACK_LOCATION` via `IoGetCurrentIrpStackLocation`, to access the requested IOCTL code (`stack->Parameters.DeviceIoControl.IoControlCode`)
- Before processing the request, we check that the input and output buffers are large enough
- We access the data sent by the client via `Irp->AssociatedIrp.SystemBuffer`
- Since Buffered I/O uses the same buffer for both input and output, we write the reply directly over the received request with `RtlCopyMemory`
- If the received IOCTL code doesn't match anything known, we return `STATUS_INVALID_DEVICE_REQUEST`
- In all cases, the request is completed with `IoCompleteRequest`, as seen in the dispatch section

---

## Example: the test client

This client is deliberately minimal. Its only purpose is to validate that the full chain works: opening the device, sending an IOCTL request, receiving the reply. It's not the project's final client, which will be developed in detail in article 12 (v0.12).

```c
#include <windows.h>
#include <stdio.h>
#include "..\include\client.h"
#include "..\..\driver\include\kdamon_shared.h"
// CLIENT_TAG is defined in client.h as : "[KDAMonitor-Client]"

int Error(const char* message) {
    printf(CLIENT_TAG " [ERROR]: %s (error=%lu)\n", message, GetLastError());
    return 1;
}

int main(int argc, const char* argv[]) {
    HANDLE hDevice = CreateFileW(
        L"\\\\.\\KDAMonitor",
        GENERIC_READ | GENERIC_WRITE,
        0,
        NULL,
        OPEN_EXISTING,
        0,
        NULL
    );

    if (hDevice == INVALID_HANDLE_VALUE)
    {
        return Error("Failed to open device");
    }

    printf(CLIENT_TAG " [SUCCESS]: Device opened successfully\n");

    KDAMON_ECHO_REQUEST request;
    request.Value = 42;

    KDAMON_ECHO_REPLY reply;
    DWORD bytesReturned = 0;

    BOOL success = DeviceIoControl(
        hDevice,
        IOCTL_KDAMON_ECHO,
        &request, sizeof(request),
        &reply, sizeof(reply),
        &bytesReturned,
        NULL
    );

    if (!success)
    {
        CloseHandle(hDevice);
        return Error("DeviceIoControl failed");
    }

    printf(CLIENT_TAG " [INFO]: Sent %lu, received %lu (bytes returned: %lu)\n",
        request.Value, reply.Value, bytesReturned);

    if (reply.Value == request.Value)
    {
        printf(CLIENT_TAG " [SUCCESS]: Echo matches\n");
    }
    else
    {
        printf(CLIENT_TAG " [ERROR]: Echo mismatch\n");
    }

    CloseHandle(hDevice);
    return 0;
}
```

The flow is simple:

1. **Opening the device** via `CreateFileW` on `\\.\KDAMonitor` — this is where the symbolic link created in `device.c` comes into play, triggering the `IRP_MJ_CREATE` IRP on the driver side
2. **Preparing the request**: a `KDAMON_ECHO_REQUEST` structure with an arbitrary value (`42`)
3. **Sending it via `DeviceIoControl`**, with the `IOCTL_KDAMON_ECHO` code — which triggers `IRP_MJ_DEVICE_CONTROL` on the driver side, bringing the whole dispatch mechanism seen earlier into play
4. **Checking the result**: if `reply.Value` matches the value sent, the full round trip from usermode to kernel and back worked correctly
5. **Closing the handle** via `CloseHandle`, which triggers `IRP_MJ_CLOSE`

This small program is enough to validate the entire mechanism built in this article: device, symbolic link, IRP dispatch, and IOCTL handling. Below is a GIF demonstrating the project's functionality:

<video controls width="100%">
  <source src="demo-echo.en.mp4" type="video/mp4">
</video>

> **Note**: the driver is compiled in **Debug** configuration (so that `KdPrint` works), while the client is compiled in **Release**. In Debug, the client compiles fine but fails to launch (some DLLs can't be found at startup). Building it in **Release** works around the issue.

---

## Conclusion

With these first two versions, KDAMonitor now has the strict essentials needed to exist as a driver: an entry point (`DriverEntry`), a device accessible from user space, and a working first IOCTL exchange.

This article turned out longer than planned — it might get trimmed down at some point.
> The next ones will be shorter :-)

Thanks for reading all the way through, and see you in the third article of this series: **Designing the Event Queue: A Generic Kernel Event Pipeline**.
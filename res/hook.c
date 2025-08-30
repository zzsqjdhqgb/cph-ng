#include <iostream>
#include <string.h>

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#include <stdarg.h>

FILE *__cdecl fopen(const char *path, const char *mode)
{
    if (mode && strchr(mode, 'r'))
        return _fdopen(_dup(_fileno(stdin)), mode);
    else
        return _fdopen(_dup(_fileno(stdout)), mode);
}

FILE *__cdecl freopen(const char *path, const char *mode, FILE *stream)
{
    if (mode && strchr(mode, 'r'))
        return _fdopen(_dup(_fileno(stdin)), mode);
    else
        return _fdopen(_dup(_fileno(stdout)), mode);
}

int __cdecl _open(const char *pathname, int flags, ...)
{
    if ((flags & _O_WRONLY) || (flags & _O_RDWR) || (flags & _O_APPEND))
        return _dup(_fileno(stdout));
    else
        return _dup(_fileno(stdin));
}

int __cdecl creat(const char *pathname, int mode)
{
    return _open(pathname, _O_CREAT | _O_WRONLY | _O_TRUNC, mode);
}

#else

#include <dlfcn.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdarg.h>

FILE *fopen(const char *path, const char *mode)
{
    if (mode && strchr(mode, 'r'))
        return fdopen(dup(STDIN_FILENO), mode);
    else
        return fdopen(dup(STDOUT_FILENO), mode);
}

FILE *freopen(const char *path, const char *mode, FILE *stream)
{
    if (mode && strchr(mode, 'r'))
        return fdopen(dup(STDIN_FILENO), mode);
    else
        return fdopen(dup(STDOUT_FILENO), mode);
}

int open(const char *pathname, int flags, ...)
{
    if ((flags & O_WRONLY) || (flags & O_RDWR) || (flags & O_APPEND))
        return dup(STDOUT_FILENO);
    else
        return dup(STDIN_FILENO);
}

#endif

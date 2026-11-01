#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/prctl.h>
#include <seccomp.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <grp.h>

int main(void) {
    // Run tests in a child process so parent process privileges are not modified
    pid_t pid = fork();
    if (pid < 0) {
        printf("{\"error\":\"fork failed\",\"errno\":%d}\n", errno);
        return 1;
    }

    if (pid == 0) {
        int rlim_ok = 1, rlim_err = 0;
        int uid_ok = 1, uid_err = 0;
        int seccomp_ok = 1, seccomp_err = 0;
        int fork_ok = 1, fork_err = 0, forked_count = 0;

        uid_t sandbox_uid = 2000000000;
        const char *env_uid = getenv("SANDBOX_UID");
        if (env_uid && *env_uid) {
            sandbox_uid = (uid_t)strtoul(env_uid, NULL, 10);
        }
        gid_t sandbox_gid = (gid_t)sandbox_uid;

        // 1. Test setrlimit (RLIMIT_AS and RLIMIT_CPU)
        struct rlimit rl;
        rl.rlim_cur = 64 * 1024 * 1024;
        rl.rlim_max = 64 * 1024 * 1024;
        if (setrlimit(RLIMIT_AS, &rl) != 0) {
            rlim_ok = 0;
            rlim_err = errno;
        }

        rl.rlim_cur = 5;
        rl.rlim_max = 6;
        if (setrlimit(RLIMIT_CPU, &rl) != 0) {
            rlim_ok = 0;
            rlim_err = errno;
        }

        // Set RLIMIT_NPROC to current limit (20)
        struct rlimit rl_nproc;
        rl_nproc.rlim_cur = 20;
        rl_nproc.rlim_max = 20;
        if (setrlimit(RLIMIT_NPROC, &rl_nproc) != 0) {
            rlim_ok = 0;
            rlim_err = errno;
        }

        // 2. Test dropping privileges to sandbox UID
        if (setgroups(0, NULL) != 0 || setresgid(sandbox_gid, sandbox_gid, sandbox_gid) != 0 || setresuid(sandbox_uid, sandbox_uid, sandbox_uid) != 0) {
            uid_ok = 0;
            uid_err = errno;
        } else if (getuid() != sandbox_uid || geteuid() != sandbox_uid || getgid() != sandbox_gid || getegid() != sandbox_gid) {
            uid_ok = 0;
            uid_err = EPERM;
        }

        // 3. Test fork 5 children under sandbox UID with current NPROC (20)
        if (uid_ok) {
            pid_t children[5];
            for (int i = 0; i < 5; ++i) {
                pid_t cp = fork();
                if (cp < 0) {
                    fork_ok = 0;
                    fork_err = errno;
                    break;
                } else if (cp == 0) {
                    _exit(0);
                } else {
                    children[forked_count++] = cp;
                }
            }
            for (int i = 0; i < forked_count; ++i) {
                waitpid(children[i], NULL, 0);
            }
        } else {
            fork_ok = 0;
            fork_err = uid_err;
        }

        // 4. Test seccomp_load
        if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
            seccomp_ok = 0;
            seccomp_err = errno;
        } else {
            scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
            if (!ctx) {
                seccomp_ok = 0;
                seccomp_err = errno;
            } else {
                seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 0);
                if (seccomp_load(ctx) != 0) {
                    seccomp_ok = 0;
                    seccomp_err = errno;
                } else {
                    // Confirm socket is blocked with EPERM
                    int s = socket(AF_INET, SOCK_STREAM, 0);
                    if (s >= 0) {
                        close(s);
                        seccomp_ok = 0;
                        seccomp_err = -1;
                    } else if (errno != EPERM) {
                        seccomp_ok = 0;
                        seccomp_err = errno;
                    }
                }
                seccomp_release(ctx);
            }
        }

        printf("{\"setrlimit\":{\"ok\":%s,\"errno\":%d},\"setuid\":{\"ok\":%s,\"errno\":%d},\"seccomp_load\":{\"ok\":%s,\"errno\":%d},\"fork_test\":{\"ok\":%s,\"forked\":%d,\"errno\":%d}}\n",
               rlim_ok ? "true" : "false", rlim_err,
               uid_ok ? "true" : "false", uid_err,
               seccomp_ok ? "true" : "false", seccomp_err,
               fork_ok ? "true" : "false", forked_count, fork_err);
        fflush(stdout);

        _exit((rlim_ok && uid_ok && seccomp_ok && fork_ok) ? 0 : 1);
    }

    int status = 0;
    waitpid(pid, &status, 0);
    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    }
    return 1;
}

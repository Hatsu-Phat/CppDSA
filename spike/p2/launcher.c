#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/prctl.h>
#include <seccomp.h>
#include <grp.h>
#include <errno.h>
#include <signal.h>
#include <fcntl.h>

static volatile pid_t g_child_pid = 0;

static void reap_all_children(void) {
    if (g_child_pid > 0) {
        kill(-g_child_pid, SIGKILL);
        kill(g_child_pid, SIGKILL);
    }
    while (waitpid(-1, NULL, WNOHANG | __WALL) > 0) {}
    usleep(10000); // 10ms
    while (waitpid(-1, NULL, WNOHANG | __WALL) > 0) {}
}

static void sig_handler(int sig) {
    reap_all_children();
    _exit(128 + sig);
}

static void print_usage(const char *prog) {
    fprintf(stderr, "Usage: %s [options] -- command [args...]\n", prog);
    fprintf(stderr, "Options:\n");
    fprintf(stderr, "  --workdir <dir>\n");
    fprintf(stderr, "  --uid <uid>\n");
    fprintf(stderr, "  --gid <gid>\n");
    fprintf(stderr, "  --tl-sec <seconds>\n");
    fprintf(stderr, "  --ml-bytes <bytes>\n");
    fprintf(stderr, "  --fsize-bytes <bytes>\n");
    fprintf(stderr, "  --nproc <max_procs>\n");
    fprintf(stderr, "  --nofile <max_files>\n");
    fprintf(stderr, "  --seccomp\n");
}

int main(int argc, char *argv[]) {
    const char *workdir = NULL;
    uid_t target_uid = 0;
    gid_t target_gid = 0;
    long tl_sec = 0;
    long long ml_bytes = 0;
    long long fsize_bytes = 0;
    int nproc = 0;
    int nofile = 32;
    int use_seccomp = 0;
    int cmd_index = -1;

    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--") == 0) {
            cmd_index = i + 1;
            break;
        }
        if (strcmp(argv[i], "--workdir") == 0 && i + 1 < argc) {
            workdir = argv[++i];
        } else if (strcmp(argv[i], "--uid") == 0 && i + 1 < argc) {
            target_uid = (uid_t)atoi(argv[++i]);
        } else if (strcmp(argv[i], "--gid") == 0 && i + 1 < argc) {
            target_gid = (gid_t)atoi(argv[++i]);
        } else if (strcmp(argv[i], "--tl-sec") == 0 && i + 1 < argc) {
            tl_sec = atol(argv[++i]);
        } else if (strcmp(argv[i], "--ml-bytes") == 0 && i + 1 < argc) {
            ml_bytes = atoll(argv[++i]);
        } else if (strcmp(argv[i], "--fsize-bytes") == 0 && i + 1 < argc) {
            fsize_bytes = atoll(argv[++i]);
        } else if (strcmp(argv[i], "--nproc") == 0 && i + 1 < argc) {
            nproc = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--nofile") == 0 && i + 1 < argc) {
            nofile = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--seccomp") == 0) {
            use_seccomp = 1;
        } else {
            fprintf(stderr, "Unknown option: %s\n", argv[i]);
            print_usage(argv[0]);
            return 1;
        }
    }

    if (cmd_index < 0 || cmd_index >= argc) {
        fprintf(stderr, "Error: No command specified after '--'\n");
        print_usage(argv[0]);
        return 1;
    }

    // Change directory if requested
    if (workdir) {
        if (chdir(workdir) != 0) {
            perror("chdir failed");
            return 1;
        }
    }

    // Register as subreaper so all orphan processes in child tree reparent here
    prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0);

    signal(SIGTERM, sig_handler);
    signal(SIGINT, sig_handler);
    signal(SIGALRM, sig_handler);

    pid_t pid = fork();
    if (pid < 0) {
        perror("fork failed");
        return 1;
    }

    if (pid == 0) {
        // Child process
        setpgid(0, 0);
        prctl(PR_SET_PDEATHSIG, SIGKILL);

        // Apply resource limits
        struct rlimit rl;

        // CPU limit
        if (tl_sec > 0) {
            rl.rlim_cur = (rlim_t)(tl_sec + 1);
            rl.rlim_max = (rlim_t)(tl_sec + 2);
            setrlimit(RLIMIT_CPU, &rl);
        }

        // Memory limit
        if (ml_bytes > 0) {
            rl.rlim_cur = (rlim_t)ml_bytes;
            rl.rlim_max = (rlim_t)ml_bytes;
            setrlimit(RLIMIT_AS, &rl);
            setrlimit(RLIMIT_DATA, &rl);
        }

        // File size limit
        if (fsize_bytes > 0) {
            rl.rlim_cur = (rlim_t)fsize_bytes;
            rl.rlim_max = (rlim_t)fsize_bytes;
            setrlimit(RLIMIT_FSIZE, &rl);
        }

        // Process limit
        if (nproc > 0) {
            rl.rlim_cur = (rlim_t)nproc;
            rl.rlim_max = (rlim_t)nproc;
            setrlimit(RLIMIT_NPROC, &rl);
        }

        // Open files limit
        if (nofile > 0) {
            rl.rlim_cur = (rlim_t)nofile;
            rl.rlim_max = (rlim_t)nofile;
            setrlimit(RLIMIT_NOFILE, &rl);
        }

        // Disable core dump
        rl.rlim_cur = 0;
        rl.rlim_max = 0;
        setrlimit(RLIMIT_CORE, &rl);

        // Drop privileges
        if (target_gid > 0) {
            if (setgid(target_gid) != 0 || setgroups(0, NULL) != 0) {
                perror("setgid/setgroups failed");
                exit(1);
            }
        }
        if (target_uid > 0) {
            if (setuid(target_uid) != 0) {
                perror("setuid failed");
                exit(1);
            }
        }

        // Verify UID and GID
        if (target_uid > 0 && (getuid() != target_uid || geteuid() != target_uid)) {
            fprintf(stderr, "Failed to drop UID privileges\n");
            exit(1);
        }
        if (target_gid > 0 && (getgid() != target_gid || getegid() != target_gid)) {
            fprintf(stderr, "Failed to drop GID privileges\n");
            exit(1);
        }

        // Set PR_SET_NO_NEW_PRIVS before seccomp
        if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
            perror("prctl PR_SET_NO_NEW_PRIVS failed");
            exit(1);
        }

        // Seccomp network block
        if (use_seccomp) {
            scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
            if (!ctx) {
                perror("seccomp_init failed");
                exit(1);
            }

            // Deny socket and network-related syscalls with EPERM
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(connect), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(bind), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(listen), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(accept), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(accept4), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(sendto), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(recvfrom), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(sendmsg), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(recvmsg), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(sendmmsg), 0);
            seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(recvmmsg), 0);

            if (seccomp_load(ctx) != 0) {
                perror("seccomp_load failed");
                exit(1);
            }
            seccomp_release(ctx);
        }

        // Clean environment
        char *clean_env[] = {
            "PATH=/usr/bin:/bin",
            "HOME=/tmp",
            "LANG=C.UTF-8",
            NULL
        };

        execve(argv[cmd_index], &argv[cmd_index], clean_env);
        perror("execve failed");
        exit(127);
    }

    // Parent launcher process
    g_child_pid = pid;
    int status = 0;
    struct rusage usage;
    memset(&usage, 0, sizeof(usage));

    if (wait4(pid, &status, 0, &usage) < 0) {
        perror("wait4 failed");
    }

    // Write execution metadata (rusage.json)
    char meta_path[512];
    if (workdir) {
        snprintf(meta_path, sizeof(meta_path), "%s/rusage.json", workdir);
    } else {
        snprintf(meta_path, sizeof(meta_path), "rusage.json");
    }

    FILE *mf = fopen(meta_path, "w");
    if (mf) {
        int exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
        int term_sig = WIFSIGNALED(status) ? WTERMSIG(status) : 0;
        long utime_ms = usage.ru_utime.tv_sec * 1000 + usage.ru_utime.tv_usec / 1000;
        long stime_ms = usage.ru_stime.tv_sec * 1000 + usage.ru_stime.tv_usec / 1000;
        fprintf(mf, "{\"maxrss_kb\": %ld, \"exit_code\": %d, \"signal\": %d, \"user_time_ms\": %ld, \"sys_time_ms\": %ld}\n",
                usage.ru_maxrss, exit_code, term_sig, utime_ms, stime_ms);
        fclose(mf);
    }

    // Clean up any remaining processes in the child's process group and all reparented descendants
    reap_all_children();

    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    } else if (WIFSIGNALED(status)) {
        return 128 + WTERMSIG(status);
    }
    return 1;
}

#include <unistd.h>
#include <iostream>
int main(){ pid_t p=fork(); if(p==0){ setsid(); if(fork()==0){ for(;;) sleep(1);} _exit(0);} std::cout<<"SAFE\n"; return 0; }

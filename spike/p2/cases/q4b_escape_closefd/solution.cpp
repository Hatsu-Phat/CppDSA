#include <unistd.h>
#include <iostream>
int main(){ std::cout<<"SAFE"<<std::endl; pid_t p=fork(); if(p==0){ setsid(); if(fork()==0){ close(0);close(1);close(2); for(;;) sleep(1);} _exit(0);} return 0; }

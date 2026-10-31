#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <sys/wait.h>
int main(){ for(int k=0;k<15;k++){ if(fork()==0){ char* p=(char*)malloc(200<<20); if(p) memset(p,1,200<<20); sleep(3); _exit(0);} } 
 char* p=(char*)malloc(300<<20); if(p) memset(p,1,300<<20); while(wait(nullptr)>0); return 0; }

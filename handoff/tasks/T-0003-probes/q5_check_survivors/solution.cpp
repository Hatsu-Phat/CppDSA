#include <dirent.h>
#include <unistd.h>
#include <sys/stat.h>
#include <iostream>
#include <string>
int main(){ DIR* d=opendir("/proc"); int n=0; std::string me=std::to_string(getpid());
 while(auto e=readdir(d)){ std::string s=e->d_name; if(s.find_first_not_of("0123456789")!=std::string::npos||s==me) continue;
   struct stat st; if(stat(("/proc/"+s).c_str(),&st)==0 && st.st_uid==getuid()) n++; }
 if(n) std::cout<<"LEAK "<<n<<" surviving sandbox processes\n"; else std::cout<<"SAFE\n"; }

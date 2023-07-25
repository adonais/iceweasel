#!/usr/bin/env python3

#- * - coding : utf - 8 - * -
import sys
import os 
import re

def write_order(obj_dir, bits) : 
    file_path2 = obj_dir + '/' + 'orderfile' + bits + '.txt'
    if os.path.exists(file_path2):
        os.remove(file_path2)
    file_path1 = obj_dir + '/' + 'orderfile.txt'
    if os.path.exists(file_path1):
        with open(file_path1,'r') as f1:
            data = f1.read() 
        with open(file_path2,'w') as f2:
            data_new = re.sub(r'^.*Counters:.*$', '', data, flags = re.M) 
            data_new = re.sub(r'^.*Hash:.*$', '', data_new, flags = re.M)
            data_new = re.sub(r':$', '', data_new, flags = re.M) 
            data_new = re.sub(r'^\s+', '', data_new, flags = re.M)
            data_new = re.sub(r'^.*\.cpp:', '', data_new, flags = re.M)
            data_new = re.sub(r'^.*\.c:', '', data_new, flags = re.M)
            data_new = re.sub(r'^.*\.0:', '', data_new, flags = re.M)
            data_new = re.sub(r'^Instrumentation.*$', '', data_new, flags = re.M)
            data_new = re.sub(r'^Functions.*$', '', data_new, flags = re.M)
            data_new = re.sub(r'^Total.*$', '', data_new, flags = re.M)
            data_new = re.sub(r'^Number.*$', '', data_new, flags = re.M)
            data_new = re.sub(r'^Maximum.*$', '', data_new, flags = re.M)
            data_new = re.sub(r'^[ \t]*\n', '', data_new, flags = re.M) 
            f2.write(data_new) 

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage:", file=sys.stderr)
        sys.exit(1)
    write_order(sys.argv[1], sys.argv[2])
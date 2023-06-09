#!/bin/bash
#DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
#cd $DIR/../
export WEBROOT=$HOME/code/dash/src
TAGS=$WEBROOT/tags
rm $TAGS 2>/dev/null
cd $WEBROOT
ls *.cpp *.h *.hpp */*p */*.h | grep -v ':' 2>/dev/null > $WEBROOT/cscope.files
ctags -R -f $TAGS  --links=no --totals=yes \
	--exclude='*.py' --exclude=Makefile* \
	--exclude='*.js' \
	--totals=no \
	--tag-relative=yes \
	--if0=no \
	--fields=+a+f+i+K+n+s+S+z+t \
	--C++-kinds=+f+c+e-g-l+m-u+v &
cscope -R -b -i $WEBROOT/cscope.files &

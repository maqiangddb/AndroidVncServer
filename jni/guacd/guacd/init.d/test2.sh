
prog="guac"
exec="/system/xbin/$prog"
pidfile="/system/etc/$prog.pid"

getpid() {
	echo "run function getpid"
	if [ -f $pidfile ]
	then
		read PID < $pidfile

		if [ -n $PID ] && ps $PID > /system/etc/null 2>&1
		then
			echo $PID
			return 0
		fi
	fi
	return 1
}

start() {
	echo "run function start"
	[ -x $exec ]
	echo -n "Starting $prog:"
	retval=$?

	case $retval in
		0)
			echo "SUCCESS"
			;;
		*)
			echo "FAIL"
			;;
	esac
	return $retval
}

stop() {
	echo "run function stop"
	echo -n "Stopping $prog:"

	PID=`getpid`
	retval=$?

	case $retval in
		0)
			if kill $PID > /system/etc/null 2>&1
			then
				echo "SUCCESS"
				return 0
			fi
			
			echo "FIAL"
			return 1
			;;
		*)
			echo "SUCCESS (not running)"
			return 0
			;;
	esac
}

restart() {
	echo "run function restart"
	stop && start
}

force_reload() {
	echo "run function force_reload"
	restart
}

status() {
	echo "run function status"
	PID=`getpid`
	retval=$?

	case $retval in
		0)
			echo "$prog is running with PID=$PID."
			;;
		*)
			echo "$prog is not running."
			;;
	esac
	return $retval
}



case "$1" in
	start|stop|status|restart|force-reload)
		echo "right command:"$1
		$1
		;;
	try-restart)
		echo "complicated command:"$1
		status && restart
		;;
	*)
		echo "Usage:$0 {start|stop|status|restart|try-restart|force-reload}"
		;;
esac
